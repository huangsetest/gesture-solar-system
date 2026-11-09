/**
 * Gesture Client
 * --------------
 * 从本地 Python 后端 (server.py) 通过 WebSocket 接收手势状态。
 *
 * 对比原项目: 原项目在浏览器里直接跑 MediaPipe Hands (CDN + 远程模型),
 * 这里把 CV 部分挪到 PC 本地 Python, 浏览器只负责渲染 + 消费手势数据。
 */
export class GestureClient {
    constructor(url) {
        this.url = url;
        this.ws = null;
        this.onState = null;
        this.onFrame = null;   // (Blob) => void, JPEG 预览帧
        this.onStatus = null;
        this.connected = false;
        this.reconnectDelay = 1000;
        this._closedByUser = false;
    }

    connect() {
        this._closedByUser = false;
        this._setStatus('连接后端服务...');

        let ws;
        try {
            ws = new WebSocket(this.url);
        } catch (e) {
            this._setStatus('连接失败: ' + e.message);
            this._scheduleReconnect();
            return;
        }
        this.ws = ws;
        ws.binaryType = 'blob';

        ws.onopen = () => {
            this.connected = true;
            this.reconnectDelay = 1000;
            this._setStatus('已连接 · 请对摄像头举起手');
        };

        ws.onmessage = (event) => {
            if (typeof event.data === 'string') {
                let data;
                try {
                    data = JSON.parse(event.data);
                } catch (e) {
                    return;
                }
                if (this.onState) {
                    this.onState(data);
                }
            } else {
                // 二进制 = JPEG 预览帧
                if (this.onFrame) {
                    this.onFrame(event.data);
                }
            }
        };

        ws.onclose = () => {
            this.connected = false;
            if (!this._closedByUser) {
                this._setStatus('后端断开，正在重连...');
                this._scheduleReconnect();
            }
        };

        ws.onerror = () => {
            this._setStatus('WebSocket 错误');
        };
    }

    _scheduleReconnect() {
        setTimeout(() => this.connect(), this.reconnectDelay);
        this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, 5000);
    }

    _setStatus(msg) {
        if (this.onStatus) {
            this.onStatus(msg);
        }
    }

    close() {
        this._closedByUser = true;
        if (this.ws) {
            this.ws.close();
        }
    }
}
