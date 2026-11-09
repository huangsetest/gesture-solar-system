/**
 * Interactive 3D Solar System
 * Realistic planets, moons, asteroid belt with hand gesture controls
 */

import { PLANET_DATA, ASTEROID_BELT, MOON_DATA } from './planetData.js';

export class SolarSystem {
    constructor(canvas) {
        this.canvas = canvas;

        // Three.js setup
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(
            60,
            canvas.width / canvas.height,
            0.1,
            1000
        );
        this.renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            alpha: true,
            antialias: true
        });

        this.renderer.setSize(canvas.width, canvas.height);
        this.renderer.setPixelRatio(window.devicePixelRatio);

        // Camera position - perfect solar system view
        this.camera.position.set(0, 80, 180);
        this.camera.lookAt(0, 0, 0);

        // Zoom range: close enough to inspect a planet, far enough to see the whole system
        this.minDistance = 8;
        this.maxDistance = 600;

        // Control state
        this.cameraDistance = 180; // Perfect view distance
        this.cameraRotationX = Math.PI / 8; // Slight angle
        this.cameraRotationY = 0;
        this.cameraPanX = 0;
        this.cameraPanY = 0;

        // Target values for smooth interpolation
        this.targetDistance = 180;
        this.targetRotationX = Math.PI / 8;
        this.targetRotationY = 0;
        this.targetPanX = 0;
        this.targetPanY = 0;

        // Best view position
        this.bestViewDistance = 180;
        this.bestViewRotationX = Math.PI / 8;
        this.bestViewRotationY = 0;

        // Hand control
        this.controlMode = 'none';
        this.lastHandPosition = { x: 0, y: 0, z: 0 };

        // Raycasting for pointing at planets
        this._raycaster = new THREE.Raycaster();
        this.focusedName = null;
        this.focusedObject = null;
        this._lastSpan = null;

        // Celestial objects
        this.sun = null;
        this.planets = {};
        this.moons = {};
        this.asteroids = [];
        this.orbitLines = [];

        // Animation
        this.time = 0;
        this.showWelcome = true;
        this.welcomeText = null;

        this.init();
        this.animate();

        // Hide welcome after 3 seconds
        setTimeout(() => {
            this.showWelcome = false;
            if (this.welcomeText) {
                this.scene.remove(this.welcomeText);
            }
        }, 3000);
    }

    init() {
        // Add stars background
        this.createStarfield();

        // Add sun
        this.createSun();

        // Add planets
        this.createPlanets();

        // Add asteroid belt (reduced for performance)
        this.createAsteroidBelt();

        // Add lighting
        const ambientLight = new THREE.AmbientLight(0x444444);
        this.scene.add(ambientLight);

        const sunLight = new THREE.PointLight(0xFFFFFF, 2, 300);
        sunLight.position.set(0, 0, 0);
        this.scene.add(sunLight);

        // Add welcome text
        this.createWelcomeText();
    }

    createStarfield() {
        const starGeometry = new THREE.BufferGeometry();
        const starPositions = [];

        // Optimized starfield - only 2000 stars for performance
        for (let i = 0; i < 2000; i++) {
            const x = (Math.random() - 0.5) * 800;
            const y = (Math.random() - 0.5) * 800;
            const z = (Math.random() - 0.5) * 800;
            starPositions.push(x, y, z);
        }

        starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));

        const starMaterial = new THREE.PointsMaterial({
            color: 0xFFFFFF,
            size: 0.7,
            transparent: true,
            opacity: 0.8
        });

        const stars = new THREE.Points(starGeometry, starMaterial);
        this.scene.add(stars);
    }

    createSun() {
        const sunGeometry = new THREE.SphereGeometry(PLANET_DATA.sun.radius, 32, 32);
        const sunMaterial = new THREE.MeshBasicMaterial({
            color: PLANET_DATA.sun.color,
            emissive: PLANET_DATA.sun.emissive,
            emissiveIntensity: PLANET_DATA.sun.emissiveIntensity
        });

        this.sun = new THREE.Mesh(sunGeometry, sunMaterial);
        this.sun.userData = {
            name: PLANET_DATA.sun.name || 'Sun',
            radius: PLANET_DATA.sun.radius,
            isSun: true
        };
        this.scene.add(this.sun);

        // Inner glow
        const innerGlow = new THREE.SphereGeometry(PLANET_DATA.sun.radius * 1.15, 32, 32);
        const innerGlowMaterial = new THREE.MeshBasicMaterial({
            color: 0xFFAA33,
            transparent: true,
            opacity: 0.4,
            side: THREE.BackSide
        });
        const innerGlowMesh = new THREE.Mesh(innerGlow, innerGlowMaterial);
        this.sun.add(innerGlowMesh);

        // Outer corona
        const outerGlow = new THREE.SphereGeometry(PLANET_DATA.sun.radius * 1.4, 32, 32);
        const outerGlowMaterial = new THREE.MeshBasicMaterial({
            color: 0xFFDD66,
            transparent: true,
            opacity: 0.2,
            side: THREE.BackSide
        });
        const outerGlowMesh = new THREE.Mesh(outerGlow, outerGlowMaterial);
        this.sun.add(outerGlowMesh);
    }

    createPlanets() {
        const planetKeys = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];

        for (const key of planetKeys) {
            const data = PLANET_DATA[key];

            // Create orbit line
            const orbitGeometry = new THREE.RingGeometry(data.distance - 0.1, data.distance + 0.1, 64);
            const orbitMaterial = new THREE.MeshBasicMaterial({
                color: 0x444444,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.3
            });
            const orbit = new THREE.Mesh(orbitGeometry, orbitMaterial);
            orbit.rotation.x = Math.PI / 2;
            this.scene.add(orbit);
            this.orbitLines.push(orbit);

            // Create planet with procedural texture
            const planetGeometry = new THREE.SphereGeometry(data.radius, 32, 32);
            const planetMaterial = this.createPlanetMaterial(key, data);

            const planet = new THREE.Mesh(planetGeometry, planetMaterial);
            planet.userData = {
                name: data.name,
                distance: data.distance,
                orbitSpeed: data.orbitSpeed,
                rotationSpeed: data.rotationSpeed,
                angle: Math.random() * Math.PI * 2
            };

            this.scene.add(planet);
            this.planets[key] = planet;

            // Add Earth's atmosphere
            if (data.atmosphere) {
                const atmosphereGeometry = new THREE.SphereGeometry(data.radius * 1.1, 32, 32);
                const atmosphereMaterial = new THREE.MeshBasicMaterial({
                    color: 0x4169E1,
                    transparent: true,
                    opacity: 0.2,
                    side: THREE.BackSide
                });
                const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
                planet.add(atmosphere);
            }

            // Add Saturn's rings (enhanced with multiple layers)
            if (data.hasRings) {
                // Inner ring
                const innerRing = new THREE.RingGeometry(data.radius * 1.3, data.radius * 1.8, 64);
                const innerRingMaterial = new THREE.MeshBasicMaterial({
                    color: 0xD4A574,
                    side: THREE.DoubleSide,
                    transparent: true,
                    opacity: 0.8
                });
                const innerRingMesh = new THREE.Mesh(innerRing, innerRingMaterial);
                innerRingMesh.rotation.x = Math.PI / 2;
                planet.add(innerRingMesh);

                // Middle ring (Cassini Division - gap)
                const middleRing = new THREE.RingGeometry(data.radius * 1.9, data.radius * 2.3, 64);
                const middleRingMaterial = new THREE.MeshBasicMaterial({
                    color: 0xC9B181,
                    side: THREE.DoubleSide,
                    transparent: true,
                    opacity: 0.6
                });
                const middleRingMesh = new THREE.Mesh(middleRing, middleRingMaterial);
                middleRingMesh.rotation.x = Math.PI / 2;
                planet.add(middleRingMesh);

                // Outer ring
                const outerRing = new THREE.RingGeometry(data.radius * 2.4, data.radius * 2.8, 64);
                const outerRingMaterial = new THREE.MeshBasicMaterial({
                    color: 0xE5D4B5,
                    side: THREE.DoubleSide,
                    transparent: true,
                    opacity: 0.4
                });
                const outerRingMesh = new THREE.Mesh(outerRing, outerRingMaterial);
                outerRingMesh.rotation.x = Math.PI / 2;
                planet.add(outerRingMesh);
            }

            // Add moons
            if (data.hasMoon) {
                this.createMoon(planet, MOON_DATA.earth, key + '_moon');
            } else if (data.moons) {
                const moonArray = key === 'jupiter' ? MOON_DATA.jupiter : MOON_DATA.saturn;
                moonArray.forEach((moonData, index) => {
                    this.createMoon(planet, moonData, `${key}_moon_${index}`);
                });
            }
        }
    }

    createMoon(planet, moonData, name) {
        const moonGeometry = new THREE.SphereGeometry(moonData.radius, 16, 16);
        const moonMaterial = new THREE.MeshStandardMaterial({
            color: moonData.color,
            roughness: 0.9
        });

        const moon = new THREE.Mesh(moonGeometry, moonMaterial);
        moon.userData = {
            name: name,
            distance: moonData.distance,
            orbitSpeed: moonData.orbitSpeed,
            angle: Math.random() * Math.PI * 2,
            parent: planet
        };

        this.scene.add(moon);
        this.moons[name] = moon;
    }

    createAsteroidBelt() {
        const asteroidGeometry = new THREE.SphereGeometry(ASTEROID_BELT.size, 4, 4); // Reduced geometry
        const asteroidMaterial = new THREE.MeshStandardMaterial({
            color: ASTEROID_BELT.color,
            roughness: 1.0
        });

        // Reduced to 800 asteroids for performance
        for (let i = 0; i < 800; i++) {
            const asteroid = new THREE.Mesh(asteroidGeometry, asteroidMaterial);

            const angle = Math.random() * Math.PI * 2;
            const distance = ASTEROID_BELT.innerRadius + Math.random() * (ASTEROID_BELT.outerRadius - ASTEROID_BELT.innerRadius);
            const height = (Math.random() - 0.5) * 2;

            asteroid.userData = {
                angle: angle,
                distance: distance,
                orbitSpeed: 0.005 + Math.random() * 0.005,
                height: height
            };

            this.scene.add(asteroid);
            this.asteroids.push(asteroid);
        }
    }

    createPlanetMaterial(planetKey, data) {
        // Create canvas for procedural texture
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        // Base color
        ctx.fillStyle = '#' + data.color.toString(16).padStart(6, '0');
        ctx.fillRect(0, 0, 512, 512);

        // Add texture based on planet type
        switch (planetKey) {
            case 'earth':
                // Add continents and oceans
                this.addEarthTexture(ctx);
                break;
            case 'mars':
                // Add craters and dust
                this.addMarsTexture(ctx);
                break;
            case 'jupiter':
                // Add bands
                this.addJupiterTexture(ctx);
                break;
            case 'saturn':
                // Add bands
                this.addSaturnTexture(ctx);
                break;
            default:
                // Add generic craters
                this.addGenericTexture(ctx, data.color);
        }

        // Create texture from canvas
        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;

        return new THREE.MeshStandardMaterial({
            map: texture,
            roughness: 0.8,
            metalness: 0.1
        });
    }

    addEarthTexture(ctx) {
        // Oceans (base blue)
        ctx.fillStyle = '#1a5f9f';
        ctx.fillRect(0, 0, 512, 512);

        // Add continents (green/brown landmasses)
        for (let i = 0; i < 60; i++) {
            const x = Math.random() * 512;
            const y = Math.random() * 512;
            const size = Math.random() * 100 + 40;

            ctx.fillStyle = i % 3 === 0 ? 'rgba(34, 139, 34, 0.7)' : 'rgba(139, 90, 43, 0.6)';
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
        }

        // Ice caps
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.fillRect(0, 0, 512, 40); // North pole
        ctx.fillRect(0, 472, 512, 40); // South pole

        // Clouds (white wisps)
        for (let i = 0; i < 40; i++) {
            ctx.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.4 + 0.2})`;
            ctx.beginPath();
            ctx.ellipse(Math.random() * 512, Math.random() * 512,
                Math.random() * 50 + 20, Math.random() * 30 + 10,
                Math.random() * Math.PI, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    addMarsTexture(ctx) {
        // Add varied red/orange tones
        for (let i = 0; i < 150; i++) {
            const alpha = Math.random() * 0.4 + 0.2;
            const shade = Math.floor(Math.random() * 3);
            if (shade === 0) {
                ctx.fillStyle = `rgba(205, 92, 92, ${alpha})`;
            } else if (shade === 1) {
                ctx.fillStyle = `rgba(139, 69, 19, ${alpha})`;
            } else {
                ctx.fillStyle = `rgba(160, 82, 45, ${alpha})`;
            }
            ctx.beginPath();
            ctx.arc(Math.random() * 512, Math.random() * 512, Math.random() * 40 + 10, 0, Math.PI * 2);
            ctx.fill();
        }

        // Craters
        for (let i = 0; i < 30; i++) {
            const x = Math.random() * 512;
            const y = Math.random() * 512;
            const size = Math.random() * 20 + 5;

            // Dark crater
            ctx.fillStyle = 'rgba(80, 40, 20, 0.5)';
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();

            // Highlight rim
            ctx.strokeStyle = 'rgba(220, 120, 80, 0.3)';
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        // Polar ice cap
        ctx.fillStyle = 'rgba(255, 240, 230, 0.6)';
        ctx.fillRect(0, 0, 512, 30);
    }

    addJupiterTexture(ctx) {
        // Horizontal bands with varied colors
        for (let y = 0; y < 512; y += 15) {
            const bandHeight = 10 + Math.random() * 15;
            const colorChoice = Math.random();

            if (colorChoice < 0.4) {
                ctx.fillStyle = `rgba(218, 165, 32, ${0.3 + Math.random() * 0.3})`;
            } else if (colorChoice < 0.7) {
                ctx.fillStyle = `rgba(139, 90, 43, ${0.3 + Math.random() * 0.3})`;
            } else {
                ctx.fillStyle = `rgba(245, 222, 179, ${0.2 + Math.random() * 0.2})`;
            }

            ctx.fillRect(0, y, 512, bandHeight);
        }

        // Great Red Spot
        const grsX = 350;
        const grsY = 256;

        // Outer ring
        ctx.fillStyle = 'rgba(180, 70, 60, 0.6)';
        ctx.beginPath();
        ctx.ellipse(grsX, grsY, 70, 45, 0, 0, Math.PI * 2);
        ctx.fill();

        // Inner core
        ctx.fillStyle = 'rgba(205, 92, 92, 0.8)';
        ctx.beginPath();
        ctx.ellipse(grsX, grsY, 50, 32, 0, 0, Math.PI * 2);
        ctx.fill();

        // Swirl effect
        ctx.strokeStyle = 'rgba(220, 100, 90, 0.5)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(grsX - 10, grsY, 25, 0, Math.PI * 1.5);
        ctx.stroke();
    }

    addSaturnTexture(ctx) {
        // Subtle horizontal bands
        for (let y = 0; y < 512; y += 25) {
            const alpha = 0.15 + Math.random() * 0.15;
            ctx.fillStyle = `rgba(210, 180, 140, ${alpha})`;
            ctx.fillRect(0, y, 512, 12 + Math.random() * 8);
        }

        // Add some storm features
        for (let i = 0; i < 5; i++) {
            ctx.fillStyle = `rgba(245, 222, 179, ${Math.random() * 0.2 + 0.1})`;
            ctx.beginPath();
            ctx.ellipse(Math.random() * 512, Math.random() * 512,
                Math.random() * 40 + 20, Math.random() * 20 + 10,
                0, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    addGenericTexture(ctx, baseColor) {
        // Add varied surface features
        for (let i = 0; i < 100; i++) {
            const darkness = Math.random() * 60 + 20;
            ctx.fillStyle = `rgba(${darkness}, ${darkness}, ${darkness}, ${Math.random() * 0.3 + 0.2})`;
            ctx.beginPath();
            ctx.arc(Math.random() * 512, Math.random() * 512, Math.random() * 25 + 5, 0, Math.PI * 2);
            ctx.fill();
        }

        // Add craters
        for (let i = 0; i < 40; i++) {
            const x = Math.random() * 512;
            const y = Math.random() * 512;
            const size = Math.random() * 15 + 3;

            ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();

            // Rim highlight
            ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.beginPath();
            ctx.arc(x - size * 0.3, y - size * 0.3, size * 0.4, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    createWelcomeText() {
        // Create simple particle text for "WELCOME TO AAYUSX"
        const textGeometry = new THREE.BufferGeometry();
        const positions = [];

        // Simple text representation with particles
        for (let i = 0; i < 500; i++) {
            positions.push(
                (Math.random() - 0.5) * 60,
                (Math.random() - 0.5) * 10,
                (Math.random() - 0.5) * 10
            );
        }

        textGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

        const textMaterial = new THREE.PointsMaterial({
            color: 0x00FF00,
            size: 0.5,
            transparent: true,
            opacity: 0.8
        });

        this.welcomeText = new THREE.Points(textGeometry, textMaterial);
        this.welcomeText.position.z = 50;
        this.scene.add(this.welcomeText);
    }

    update(handPosition, isHandDetected, gesture, extra) {
        // dt: 真实经过的秒数, 让缩放速度与帧率无关
        const now = performance.now();
        if (this._lastUpdateTime === undefined) {
            this._lastUpdateTime = now;
        }
        const dt = Math.min((now - this._lastUpdateTime) / 1000, 0.1);
        this._lastUpdateTime = now;

        this.time += 0.01;
        extra = extra || {};

        // Update control mode based on gesture
        if (isHandDetected) {
            switch (gesture) {
                case 'rotate':
                    // 握拳 = 退出聚焦, 回到自由视角旋转
                    this.clearFocus();
                    this.controlMode = 'rotate';
                    this.handleRotate(handPosition);
                    break;
                case 'pan':
                    this.controlMode = 'pan';
                    this.handlePan(handPosition);
                    break;
                case 'zoomin':
                    this.controlMode = 'zoom';
                    // 60 单位/秒, 按真实时间推进, 与帧率无关
                    this.targetDistance -= 60 * dt;
                    this.targetDistance = Math.max(this.minDistance, Math.min(this.maxDistance, this.targetDistance));
                    break;
                case 'zoomout':
                    this.controlMode = 'zoom';
                    this.targetDistance += 60 * dt;
                    this.targetDistance = Math.max(this.minDistance, Math.min(this.maxDistance, this.targetDistance));
                    break;
                case 'twospan':
                    // 双手张开: 双手间距越大 -> 拉近(像把星系往中间捏)
                    this.controlMode = 'twospan';
                    this.handleTwoHandSpan(extra.twoHandSpan);
                    break;
                case 'point':
                    // 食指指向: 选中行星并聚焦
                    this.controlMode = 'point';
                    this.handlePoint(extra.tip);
                    break;
                case 'box': // 3 fingers = Best View
                    this.controlMode = 'bestview';
                    this.clearFocus();
                    this.targetDistance = this.bestViewDistance;
                    this.targetRotationX = this.bestViewRotationX;
                    this.targetRotationY = this.bestViewRotationY;
                    this.targetPanX = 0;
                    this.targetPanY = 0;
                    break;
                default:
                    this.controlMode = 'none';
            }
            this.lastHandPosition = handPosition;
        } else {
            this.controlMode = 'none';
            // Auto-rotate when no hand
            this.targetRotationY += 0.002;
        }

        // Smooth interpolation (lerp) for buttery smooth movement
        const smoothness = 0.1; // Lower = smoother but slower
        this.cameraDistance += (this.targetDistance - this.cameraDistance) * smoothness;
        this.cameraRotationX += (this.targetRotationX - this.cameraRotationX) * smoothness;
        this.cameraRotationY += (this.targetRotationY - this.cameraRotationY) * smoothness;
        this.cameraPanX += (this.targetPanX - this.cameraPanX) * smoothness;
        this.cameraPanY += (this.targetPanY - this.cameraPanY) * smoothness;

        // 聚焦模式: 拉近到目标天体(相机跟随在 updateCamera 里处理, 这里只管距离)
        if (this.focusedObject && this._focusTargetDistance) {
            this.targetDistance += (this._focusTargetDistance - this.targetDistance) * 0.08;
        }

        // Update camera position
        this.updateCamera();

        // Update planet positions
        this.updatePlanets();

        // Update moon positions
        this.updateMoons();

        // Update asteroids
        this.updateAsteroids();

        // 聚焦目标的标签跟随
        if (this.focusedObject && this.focusedLabel) {
            this.focusedLabel.position.set(
                this.focusedObject.position.x,
                this.focusedObject.position.y + 4,
                this.focusedObject.position.z
            );
        }
    }

    handleRotate(handPosition) {
        const deltaX = handPosition.x - this.lastHandPosition.x;
        const deltaY = handPosition.y - this.lastHandPosition.y;

        this.targetRotationY += deltaX * 3;
        this.targetRotationX += deltaY * 3;
        this.targetRotationX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.targetRotationX));
    }

    /**
     * 双手张开时的间距缩放。
     * span 越大(双手越分开) -> 越靠近, 像把整个星系往中间捏。
     *
     * 注意: render 帧率(60fps)高于手势数据帧率(~30fps), 同一个 span 会被
     * 重复消费多次。所以必须只在 span 真正变化时才累加增量, 否则缩放会失控。
     */
    handleTwoHandSpan(span) {
        if (!span || span <= 0) return;

        if (this._lastSpan === undefined || this._lastSpan === null) {
            this._lastSpan = span;
            return;
        }
        const delta = span - this._lastSpan;
        if (Math.abs(delta) < 1e-6) return;   // 值没变 -> 本帧不重复累加
        this._lastSpan = span;

        // 双手分开 -> 拉近; 双手靠拢 -> 拉远
        this.targetDistance -= delta * 260;
        this.targetDistance = Math.max(this.minDistance, Math.min(this.maxDistance, this.targetDistance));
    }

    /**
     * 食指指向: 选中行星并聚焦。
     * tip 是摄像头归一化坐标 [x, y] (0~1, 未镜像)。
     *
     * 用"投影到屏幕空间找最近天体"而不是纯几何射线:
     * 行星半径很小(如地球 radius=1), 在远距离下射线几乎打不中,
     * 屏幕空间匹配 + 容差更稳, 也更符合直觉(手指指哪就选哪)。
     */
    handlePoint(tip) {
        if (!tip) return;

        // 摄像头是镜像的, x 翻转后对应屏幕方向; y 直接用
        const screenX = 1 - tip[0];
        const screenY = tip[1];

        // 容差: 屏幕高度的 6%
        const tol = 0.06;

        let best = null;
        let bestDist = tol;

        const consider = (obj) => {
            if (!obj) return;
            const v = obj.position.clone();
            v.project(this.camera);   // -> NDC [-1, 1]
            if (v.z > 1) return;     // 在相机背后
            const sx = (v.x + 1) / 2;
            const sy = 1 - (v.y + 1) / 2;
            const d = Math.hypot(sx - screenX, sy - screenY);
            if (d < bestDist) {
                bestDist = d;
                best = obj;
            }
        };

        consider(this.sun);
        for (const key in this.planets) consider(this.planets[key]);

        if (best) {
            const name = best.userData && best.userData.name;
            if (name && name !== this.focusedName) {
                this.focusedName = name;
                this.focusedObject = best;
                this._focusTargetDistance = this._distanceForFocus(best);
                this._updateFocusLabel(name);
            }
            this._missCount = 0;
        } else {
            // 没选中: 连续多次未命中才解除, 避免手抖掉焦点
            this._missCount = (this._missCount || 0) + 1;
            if (this._missCount > 12) {
                this.clearFocus();
            }
        }
    }

    /** 聚焦目标的名称标签 */
    _updateFocusLabel(name) {
        if (this.focusedLabel) {
            this.scene.remove(this.focusedLabel);
        }
        // 用 Canvas 贴图做标签, 不依赖字体文件
        const cv = document.createElement('canvas');
        cv.width = 256;
        cv.height = 64;
        const ctx = cv.getContext('2d');
        ctx.fillStyle = 'rgba(0,255,0,0.85)';
        ctx.font = 'bold 34px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(name, 128, 34);

        const tex = new THREE.CanvasTexture(cv);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
            map: tex,
            transparent: true,
            depthTest: false
        }));
        sprite.scale.set(16, 4, 1);
        this.focusedLabel = sprite;
        this.scene.add(sprite);
    }

    /** 解除聚焦, 回到自由视角 */
    clearFocus() {
        if (!this.focusedObject && !this.focusedName) return;
        this.focusedName = null;
        this.focusedObject = null;
        this._focusTargetDistance = 0;
        this._missCount = 0;
        if (this.focusedLabel) {
            this.scene.remove(this.focusedLabel);
            this.focusedLabel = null;
        }
    }

    /** 根据目标大小计算合适的观察距离 */
    _distanceForFocus(obj) {
        const r = obj.geometry && obj.geometry.parameters
            ? obj.geometry.parameters.radius
            : 3;
        // 视场角 60 度, 距离约等于 3 倍半径时能看全并留些余量
        // 下限用 minDistance 保证不会穿模
        return Math.max(this.minDistance, Math.min(this.maxDistance, r * 5.5));
    }

    handlePan(handPosition) {
        const deltaX = handPosition.x - this.lastHandPosition.x;
        const deltaY = handPosition.y - this.lastHandPosition.y;

        this.targetPanX += deltaX * 80;
        this.targetPanY -= deltaY * 80;
    }

    updateCamera() {
        // 聚焦模式: 相机绕着被选中的天体转, 而不是平移整个场景
        if (this.focusedObject) {
            const f = this.focusedObject;
            const cx = f.position.x;
            const cy = f.position.y;
            const cz = f.position.z;
            const x = cx + this.cameraDistance * Math.sin(this.cameraRotationY) * Math.cos(this.cameraRotationX);
            const y = cy + this.cameraDistance * Math.sin(this.cameraRotationX);
            const z = cz + this.cameraDistance * Math.cos(this.cameraRotationY) * Math.cos(this.cameraRotationX);
            this.camera.position.set(x, y, z);
            this.camera.lookAt(cx, cy, cz);
            return;
        }

        const x = this.cameraDistance * Math.sin(this.cameraRotationY) * Math.cos(this.cameraRotationX);
        const y = this.cameraDistance * Math.sin(this.cameraRotationX);
        const z = this.cameraDistance * Math.cos(this.cameraRotationY) * Math.cos(this.cameraRotationX);

        this.camera.position.set(x + this.cameraPanX, y + this.cameraPanY, z);
        this.camera.lookAt(this.cameraPanX, this.cameraPanY, 0);
    }

    updatePlanets() {
        for (const key in this.planets) {
            const planet = this.planets[key];
            const data = planet.userData;

            // Update orbit
            data.angle += data.orbitSpeed;
            planet.position.x = Math.cos(data.angle) * data.distance;
            planet.position.z = Math.sin(data.angle) * data.distance;

            // Update rotation
            planet.rotation.y += data.rotationSpeed;
        }
    }

    updateMoons() {
        for (const key in this.moons) {
            const moon = this.moons[key];
            const data = moon.userData;

            data.angle += data.orbitSpeed;
            moon.position.x = data.parent.position.x + Math.cos(data.angle) * data.distance;
            moon.position.z = data.parent.position.z + Math.sin(data.angle) * data.distance;
            moon.position.y = data.parent.position.y;
        }
    }

    updateAsteroids() {
        for (const asteroid of this.asteroids) {
            const data = asteroid.userData;
            data.angle += data.orbitSpeed;

            asteroid.position.x = Math.cos(data.angle) * data.distance;
            asteroid.position.z = Math.sin(data.angle) * data.distance;
            asteroid.position.y = data.height;
            asteroid.rotation.x += 0.01;
            asteroid.rotation.y += 0.01;
        }
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        // Rotate sun
        if (this.sun) {
            this.sun.rotation.y += 0.001;
        }

        // Render
        this.renderer.render(this.scene, this.camera);
    }

    onResize() {
        this.camera.aspect = this.canvas.width / this.canvas.height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.canvas.width, this.canvas.height);
    }
}
