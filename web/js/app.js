/**
 * 手势太阳系 · 前端主程序
 * ------------------------
 * 架构:
 *   Python server.py  (摄像头 + MediaPipe 手势识别)
 *        ↓  WebSocket (JSON: gesture / x / y / z / landmarks / fps)
 *   gestureClient.js  (连接与重连)
 *        ↓
 *   solarSystem.js    (Three.js 太阳系渲染 + 相机控制)
 *
 * 同时保留鼠标拖拽旋转 / 滚轮缩放作为备用手势, 手势识别失败也能玩。
 */

import { GestureClient } from './gestureClient.js';
import { SolarSystem } from './solarSystem.js';

class GestureSolarApp {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.video = document.getElementById('video');
        this.videoOverlay = document.getElementById('videoOverlay');
        this.videoCtx = this.videoOverlay.getContext('2d');

        this.handPosEl = document.getElementById('hand-position');
        this.handCountEl = document.getElementById('hand-count');
        this.fpsEl = document.getElementById('fps');
        this.gestureEl = document.getElementById('gesture');
        this.distanceEl = document.getElementById('distance');
        this.velocityEl = document.getElementById('velocity');
        this.statusEl = document.getElementById('status');
        this.connEl = document.getElementById('conn');

        // 手势状态
        this.handPosition = { x: 0, y: 0, z: 0 };
        this.prevHandPosition = { x: 0, y: 0, z: 0 };
        this.isHandDetected = false;
        this.currentGesture = 'none';

        // 渲染层
        this.solarSystem = new SolarSystem(this.canvas);

        // 画布尺寸必须显式设置, 否则 Three.js 用默认 300x150, 画面会缩成一小块
        this.setupCanvas();

        // 鼠标兜底控制
        this.mouse = { dragging: false, lastX: 0, lastY: 0 };
        this.setupMouseFallback();

        // 连接后端
        this.setupClient();

        this.animate();
    }

    // ------------------------------------------------------------------
    setupCanvas() {
        const resize = () => {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
            if (this.solarSystem) {
                this.solarSystem.onResize();
            }
        };
        resize();
        window.addEventListener('resize', resize);
    }

    // ------------------------------------------------------------------
    setupClient() {
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${proto}//${location.host}/`;

        this.client = new GestureClient(wsUrl);
        this.client.onStatus = (msg) => this.updateStatus(msg);
        this.client.onState = (state) => this.onGestureState(state);
        this.client.onFrame = (blob) => this.onPreviewFrame(blob);
        this.client.connect();
    }

    /**
     * 后端推来的 JPEG 帧: 显示在预览框里, 骨架画在上层 overlay 上。
     */
    onPreviewFrame(blob) {
        if (this._lastFrameUrl) {
            URL.revokeObjectURL(this._lastFrameUrl);
        }
        this._lastFrameUrl = URL.createObjectURL(blob);
        const img = document.getElementById('video');
        if (img) {
            img.src = this._lastFrameUrl;
            const box = img.parentElement;
            if (box && box.classList.contains('no-frame')) {
                box.classList.remove('no-frame');
            }
        }
        if (this.videoOverlay.width !== 320) {
            this.videoOverlay.width = 320;
            this.videoOverlay.height = 240;
        }
    }

    onGestureState(state) {
        this.prevHandPosition = { ...this.handPosition };
        this.handPosition = { x: state.x, y: state.y, z: state.z };
        this.isHandDetected = !!state.hand_detected;
        this.currentGesture = state.gesture || 'none';
        this.serverFps = state.fps;
        this.handCount = state.hand_count || 0;
        this.twoHandSpan = state.two_hand_span || 0;
        this.fingerTip = state.tip || [0.5, 0.5];

        if (this.connEl) {
            this.connEl.textContent = '● 已连接';
            this.connEl.className = 'value conn-ok';
        }

        this.drawLandmarks(state.landmarks || [], state.hands || []);
    }

    // ------------------------------------------------------------------
    // 手部骨架绘制(叠加在预览画面上)
    // ------------------------------------------------------------------
    drawLandmarks(landmarks, allHands) {
        const w = this.videoOverlay.width;
        const h = this.videoOverlay.height;
        this.videoCtx.clearRect(0, 0, w, h);

        if (!landmarks.length) {
            this.videoCtx.fillStyle = 'rgba(255,255,255,0.6)';
            this.videoCtx.font = '13px monospace';
            this.videoCtx.fillText('等待手部进入画面...', 10, 22);
            return;
        }

        const connections = [
            [0, 1], [1, 2], [2, 3], [3, 4],
            [0, 5], [5, 6], [6, 7], [7, 8],
            [0, 9], [9, 10], [10, 11], [11, 12],
            [0, 13], [13, 14], [14, 15], [15, 16],
            [0, 17], [17, 18], [18, 19], [19, 20],
            [5, 9], [9, 13], [13, 17]
        ];

        // 双手时用不同颜色区分
        const palette = ['#39ff88', '#ffd166', '#4fc3f7'];

        // 画所有手(后端已给出手序), 主导手最后画在上层
        const hands = (allHands && allHands.length) ? allHands : [{ landmarks }];
        hands.forEach((hand, i) => {
            const pts = hand.landmarks || [];
            if (!pts.length) return;
            const color = palette[i % palette.length];

            this.videoCtx.strokeStyle = color;
            this.videoCtx.lineWidth = 2;
            for (const [s, e] of connections) {
                const a = pts[s], b = pts[e];
                if (!a || !b) continue;
                this.videoCtx.beginPath();
                this.videoCtx.moveTo(a[0] * w, a[1] * h);
                this.videoCtx.lineTo(b[0] * w, b[1] * h);
                this.videoCtx.stroke();
            }

            this.videoCtx.fillStyle = color;
            for (const p of pts) {
                this.videoCtx.beginPath();
                this.videoCtx.arc(p[0] * w, p[1] * h, 3, 0, Math.PI * 2);
                this.videoCtx.fill();
            }

            // 标出手势名
            this.videoCtx.fillStyle = color;
            this.videoCtx.font = 'bold 12px monospace';
            this.videoCtx.fillText(
                (hand.gesture || '').toUpperCase(),
                pts[0][0] * w - 14,
                pts[0][1] * h + 16
            );
        });
    }

    // ------------------------------------------------------------------
    // 鼠标兜底: 左键拖拽旋转, 滚轮缩放
    // ------------------------------------------------------------------
    setupMouseFallback() {
        this.canvas.addEventListener('mousedown', (e) => {
            this.mouse.dragging = true;
            this.mouse.lastX = e.clientX;
            this.mouse.lastY = e.clientY;
        });
        window.addEventListener('mouseup', () => { this.mouse.dragging = false; });
        window.addEventListener('mousemove', (e) => {
            if (!this.mouse.dragging) return;
            const dx = (e.clientX - this.mouse.lastX) / window.innerWidth;
            const dy = (e.clientY - this.mouse.lastY) / window.innerHeight;
            this.mouse.lastX = e.clientX;
            this.mouse.lastY = e.clientY;

            const ss = this.solarSystem;
            ss.targetRotationY += dx * 3;
            ss.targetRotationX += dy * 3;
            ss.targetRotationX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, ss.targetRotationX));
        });
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const ss = this.solarSystem;
            ss.targetDistance += e.deltaY * 0.6;
            ss.targetDistance = Math.max(50, Math.min(300, ss.targetDistance));
        }, { passive: false });
    }

    // ------------------------------------------------------------------
    animate() {
        requestAnimationFrame(() => this.animate());

        // 手势优先; 无手势时太阳系自动旋转(在 solarSystem.update 里处理)
        this.solarSystem.update(
            this.handPosition,
            this.isHandDetected,
            this.currentGesture,
            {
                twoHandSpan: this.twoHandSpan,
                tip: this.fingerTip
            }
        );

        this.updateUI();
    }

    updateUI() {
        if (this.handPosEl) {
            this.handPosEl.textContent =
                `X: ${this.handPosition.x.toFixed(3)}, Y: ${this.handPosition.y.toFixed(3)}, Z: ${this.handPosition.z.toFixed(3)}`;
        }

        if (this.gestureEl) {
            const names = {
                'rotate': '✊ 旋转',
                'pan': '✋ 平移',
                'zoomin': '✌️ 拉近',
                'zoomout': '🤏 拉远',
                'box': '🤟 最佳视角',
                'point': '☝️ 指向行星',
                'twospan': '👐 双手缩放',
                'none': '无'
            };
            if (this.isHandDetected) {
                this.gestureEl.textContent = names[this.currentGesture] || this.currentGesture;
                this.gestureEl.className = 'value gesture-' + this.currentGesture;
            } else {
                this.gestureEl.textContent = '自动旋转';
                this.gestureEl.className = 'value';
            }
        }

        if (this.handCountEl) {
            this.handCountEl.textContent = this.handCount || 0;
        }

        if (this.fpsEl) {
            this.fpsEl.textContent = this.serverFps !== undefined ? this.serverFps : '--';
        }

        if (this.distanceEl) {
            const d = Math.sqrt(
                this.handPosition.x ** 2 +
                this.handPosition.y ** 2 +
                this.handPosition.z ** 2
            );
            this.distanceEl.textContent = d.toFixed(3);
        }

        if (this.velocityEl) {
            const v = Math.sqrt(
                (this.handPosition.x - this.prevHandPosition.x) ** 2 +
                (this.handPosition.y - this.prevHandPosition.y) ** 2 +
                (this.handPosition.z - this.prevHandPosition.z) ** 2
            );
            this.velocityEl.textContent = v.toFixed(4);
        }
    }

    updateStatus(message) {
        if (this.statusEl) {
            this.statusEl.textContent = message;
        }
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.app = new GestureSolarApp();
});
