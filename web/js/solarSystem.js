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

    update(handPosition, isHandDetected, gesture) {
        this.time += 0.01;

        // Update control mode based on gesture
        if (isHandDetected) {
            switch (gesture) {
                case 'rotate':
                    this.controlMode = 'rotate';
                    this.handleRotate(handPosition);
                    break;
                case 'pan':
                    this.controlMode = 'pan';
                    this.handlePan(handPosition);
                    break;
                case 'zoomin':
                    this.controlMode = 'zoom';
                    this.targetDistance -= 3;
                    this.targetDistance = Math.max(50, Math.min(300, this.targetDistance));
                    break;
                case 'zoomout':
                    this.controlMode = 'zoom';
                    this.targetDistance += 3;
                    this.targetDistance = Math.max(50, Math.min(300, this.targetDistance));
                    break;
                case 'box': // 3 fingers = Best View
                    this.controlMode = 'bestview';
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

        // Update camera position
        this.updateCamera();

        // Update planet positions
        this.updatePlanets();

        // Update moon positions
        this.updateMoons();

        // Update asteroids
        this.updateAsteroids();
    }

    handleRotate(handPosition) {
        const deltaX = handPosition.x - this.lastHandPosition.x;
        const deltaY = handPosition.y - this.lastHandPosition.y;

        this.targetRotationY += deltaX * 3;
        this.targetRotationX += deltaY * 3;
        this.targetRotationX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.targetRotationX));
    }

    handlePan(handPosition) {
        const deltaX = handPosition.x - this.lastHandPosition.x;
        const deltaY = handPosition.y - this.lastHandPosition.y;

        this.targetPanX += deltaX * 80;
        this.targetPanY -= deltaY * 80;
    }

    updateCamera() {
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
