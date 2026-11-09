# -*- coding: utf-8 -*-
"""
手势太阳系 · 后端服务
=====================
职责:
  1. 从 USB 摄像头抓帧
  2. 用 MediaPipe (Tasks API) 做手部关键点检测 + 手势分类
  3. 通过 WebSocket 把手势状态实时推给浏览器端(Three.js 太阳系)
  4. 在同一个端口上提供前端静态文件 (HTTP)

与原 GitHub 项目 (aayusxat7/Gesture-Solar) 的区别:
  原项目用手势在浏览器端直接跑 MediaPipe Hands (依赖 jsdelivr CDN + 远程模型),
  国内网络经常卡住 / 模型加载失败。
  本项目把 MediaPipe 放到 PC 本地 Python 端, 模型随 wheel 打包, 完全离线可用,
  延迟也更低(本地 USB 摄像头 -> 本地 WebSocket)。

手势映射 (与前端 solarSystem.update() 的 gesture 字符串一一对应):
  rotate  握拳        -> 手掌左右/上下移动 = 旋转视角
  pan     张开手掌    -> 平移视角
  zoomin  食指+中指   -> 缩放(拉近)
  zoomout 食指+中指距离变化(向外张开) -> 缩放(拉远)
  box     三指        -> 最佳视角
  none    无手        -> 自动旋转

运行:  python server.py [--port 8001] [--cam 0] [--host 127.0.0.1]
"""

import argparse
import asyncio
import base64
import json
import logging
import mimetypes
import os
import sys
import threading
import time
from pathlib import Path

import cv2
import numpy as np

from mediapipe.tasks.python import BaseOptions, vision
from mediapipe.tasks.python.vision.core.image import Image, ImageFormat

# --------------------------------------------------------------------------
# 路径
# --------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parent
WEB_DIR = ROOT / "web"
MODEL_PATH = ROOT / "models" / "hand_landmarker.task"

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("gesture-solar")


# --------------------------------------------------------------------------
# 手势分类
# --------------------------------------------------------------------------
FINGER_TIPS = (4, 8, 12, 16, 20)
FINGER_PIPS = (3, 6, 10, 14, 18)


def _dist(a, b) -> float:
    return float(np.linalg.norm(np.array(a) - np.array(b)))


def _angle_at(a, b, c) -> float:
    """向量 b->a 与 b->c 的夹角(度)。180 = 完全伸直, 0 = 完全弯曲。"""
    v1 = np.array(a) - np.array(b)
    v2 = np.array(c) - np.array(b)
    n1 = np.linalg.norm(v1)
    n2 = np.linalg.norm(v2)
    if n1 < 1e-9 or n2 < 1e-9:
        return 180.0
    cos = float(np.clip(np.dot(v1, v2) / (n1 * n2), -1.0, 1.0))
    return float(np.degrees(np.arccos(cos)))


def _hand_scale(landmarks) -> float:
    """手掌尺度: 腕(0) 到 中指根(9) 的距离, 用于做尺度不变的手指伸展判定。"""
    return max(_dist(landmarks[0], landmarks[9]), 1e-6)


def classify_gesture(landmarks) -> str:
    """
    根据 21 个手部关键点判定手势。

    判定策略:
      - 手指伸展: 用 PIP 关节处的夹角判定 (MCP-PIP-TIP 三点夹角)。
        接近 180 度 = 伸直, 接近 90 度以下 = 弯曲。
        比"指尖离腕距离"法稳健得多 —— 握拳时指尖虽然仍远离手腕,
        但 PIP 关节明显弯曲, 角度判定不会误判成张开。
      - 拇指单独判定: 拇指 IP 关节 (2-3-4) 的夹角 + 拇指尖离小指根的距离。
      - 张开手掌 (4 指以上伸展) -> pan
      - 全握拳 (0 指伸展)      -> rotate
      - 2 指伸展              -> zoomin / zoomout
      - 3 指伸展              -> box
    """
    wrist = landmarks[0]
    scale = _hand_scale(landmarks)

    # 食指/中指/无名指/小指: MCP(5,9,13,17) - PIP(6,10,14,18) - TIP(8,12,16,20)
    extended = []
    for mcp, pip, tip in ((5, 6, 8), (9, 10, 12), (13, 14, 16), (17, 18, 20)):
        ang = _angle_at(landmarks[mcp], landmarks[pip], landmarks[tip])
        extended.append(ang > 140.0)

    # 拇指判定: 用「拇指尖(4) 相对食指根(5)-小指根(17) 连线」的位置。
    # 拇指收回在掌心 -> 指尖落在该连线附近(靠近手掌中轴);
    # 拇指伸出(尤其侧向张开) -> 指尖明显跑到连线外侧。
    # 用垂距 / 手掌宽度 的比值, 对远近和手掌朝向都不敏感。
    v = np.array(landmarks[17]) - np.array(landmarks[5])       # 食指根 -> 小指根
    w = np.array(landmarks[4]) - np.array(landmarks[5])        # 食指根 -> 拇指尖
    vlen = np.linalg.norm(v)
    if vlen < 1e-6:
        thumb_out = False
    else:
        # 垂距 = |w x v| / |v|  (显式 2D 叉积, 兼容 numpy 2.x)
        cross = float(w[0] * v[1] - w[1] * v[0])
        perp = abs(cross / vlen)
        # 沿连线方向的投影, 归一化到 [0,1]
        along = float(np.dot(w, v) / (vlen * vlen))
        # 指尖超出连线两端(u<0 在食指根外, u>1 在小指根外)也算伸出
        beyond = along < -0.05 or along > 1.05
        thumb_out = bool(perp > vlen * 0.35 or beyond)
    extended.insert(0, bool(thumb_out))

    count = sum(extended)
    # extended[0]=拇指, [1]=食指, [2]=中指, [3]=无名指, [4]=小指
    thumb, index, middle, ring, pinky = extended

    # 全掌张开(>=4 指) -> pan。放最前, 避免下面的组合规则误伤。
    if count >= 4:
        return "pan"

    # 三指(食指+中指+无名指, 小指收起) -> 最佳视角
    if index and middle and ring:
        return "box"

    # 食指单独伸出(其余手指收起) -> point, 用于指向选择行星
    if index and not middle and not ring and not pinky:
        return "point"

    # 食指+中指 -> 缩放(用两指张合)
    if index and middle:
        return "zoomin"

    if count == 0:
        return "rotate"
    if count == 1:
        # 只伸出拇指(竖大拇指) -> 视为张开, 便于双手配合
        return "pan" if thumb else "rotate"
    return "pan"


# --------------------------------------------------------------------------
# 手势识别线程
# --------------------------------------------------------------------------
class GestureEngine:
    """后台线程: 抓帧 -> MediaPipe -> 产出最新手势状态。"""

    def __init__(self, cam_index: int = 0, width: int = 640, height: int = 480):
        self.cam_index = cam_index
        self.width = width
        self.height = height

        self._lock = threading.Lock()
        self.latest: dict = {
            "hand_detected": False,
            "gesture": "none",
            "x": 0.0,
            "y": 0.0,
            "z": 0.0,
            "landmarks": [],
            "fps": 0.0,
            "pinch": 0.0,
        }
        self._jpeg: bytes | None = None

        self.running = False
        self._thread: threading.Thread | None = None
        self._landmarker = None
        self._cap = None
        self._ready = threading.Event()   # 模型+摄像头都就绪后置位
        self._startup_error: str | None = None

        # 两指距离历史, 用于区分 zoomin / zoomout
        self._prev_two_finger_dist: float | None = None

    # -- 资源 -------------------------------------------------------------
    def _open_camera(self) -> bool:
        # DSHOW 在 Windows 上更稳, 失败再退回默认后端
        for backend_name, backend in (("DSHOW", cv2.CAP_DSHOW), ("ANY", cv2.CAP_ANY)):
            cap = cv2.VideoCapture(self.cam_index, backend)
            if cap.isOpened():
                cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
                cap.set(cv2.CAP_PROP_FPS, 30)
                self._cap = cap
                log.info("摄像头已打开: index=%s backend=%s %dx%d",
                         self.cam_index, backend_name,
                         int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
                         int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)))
                return True
            cap.release()
        log.error("无法打开摄像头 index=%s", self.cam_index)
        self._startup_error = f"无法打开摄像头 index={self.cam_index}"
        return False

    def _open_model(self) -> bool:
        if not MODEL_PATH.exists():
            log.error("模型文件不存在: %s", MODEL_PATH)
            self._startup_error = f"模型文件不存在: {MODEL_PATH}"
            return False
        try:
            options = vision.HandLandmarkerOptions(
                base_options=BaseOptions(model_asset_path=str(MODEL_PATH)),
                # VIDEO 模式: detect_for_video() 同步返回结果, 不强制要求 result_callback
                # (MediaPipe 1.x 的 LIVE_STREAM 模式强制要求回调, 这里用 VIDEO 更可控)
                running_mode=vision.RunningMode.VIDEO,
                num_hands=2,
                min_hand_detection_confidence=0.5,
                min_hand_presence_confidence=0.5,
                min_tracking_confidence=0.5,
            )
            self._landmarker = vision.HandLandmarker.create_from_options(options)
            log.info("MediaPipe 模型加载完成: %s", MODEL_PATH.name)
            return True
        except Exception as e:  # noqa: BLE001
            log.error("MediaPipe 初始化失败: %s", e)
            self._startup_error = f"MediaPipe 初始化失败: {e}"
            return False

    # -- 主循环 -----------------------------------------------------------
    def _run(self):
        if not self._open_model():
            self._ready.set()
            return
        if not self._open_camera():
            self._ready.set()
            return

        self.running = True
        self._ready.set()
        frame_count = 0
        fps_t0 = time.time()
        ts = 0

        while self.running:
            ok, frame = self._cap.read()
            if not ok:
                time.sleep(0.005)
                continue

            ts += 33  # 毫秒时间戳, 单调递增即可

            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_image = Image(image_format=ImageFormat.SRGB, data=rgb)

            try:
                result = self._landmarker.detect_for_video(mp_image, ts)
            except Exception as e:  # noqa: BLE001
                log.warning("推理异常: %s", e)
                continue

            frame_count += 1
            elapsed = time.time() - fps_t0
            fps = frame_count / elapsed if elapsed > 0 else 0.0
            if elapsed >= 1.0:
                frame_count = 0
                fps_t0 = time.time()

            state = {
                "hand_detected": False,
                "gesture": "none",
                "x": 0.0, "y": 0.0, "z": 0.0,
                "landmarks": [],
                "fps": round(fps, 1),
                "pinch": 0.0,
                "tip": [0.5, 0.5],
                "hand_count": 0,
                "hands": [],
                "two_hand_span": 0.0,
            }

            hands = getattr(result, "hand_landmarks", None) or []
            if hands:
                parsed = []
                for lm in hands:
                    pts = [(p.x, p.y, p.z) for p in lm]
                    cx = sum(p[0] for p in pts) / len(pts)
                    cy = sum(p[1] for p in pts) / len(pts)
                    cz = sum(p[2] for p in pts) / len(pts)

                    gesture = classify_gesture(pts)

                    # 两指(食指+中指)间距 -> 缩放方向
                    two = _dist(pts[8], pts[12])
                    if gesture == "zoomin":
                        if self._prev_two_finger_dist is not None:
                            # 手指数固定时, 用两指张开/合拢来判断拉近拉远
                            if two > self._prev_two_finger_dist * 1.08:
                                gesture = "zoomout"
                            elif two < self._prev_two_finger_dist * 0.92:
                                gesture = "zoomin"
                        self._prev_two_finger_dist = two
                    else:
                        self._prev_two_finger_dist = None

                    tip = pts[8]  # 食指尖, 用于指向选择行星

                    parsed.append({
                        "gesture": gesture,
                        "x": round((cx - 0.5) * 2, 4),
                        "y": round(-(cy - 0.5) * 2, 4),
                        "z": round(cz, 4),
                        "pinch": round(two, 4),
                        "tip": [round(tip[0], 4), round(tip[1], 4)],
                        "landmarks": [[round(p[0], 4), round(p[1], 4), round(p[2], 4)]
                                      for p in pts],
                    })

                # 按 x 排序, 保证左右顺序稳定
                parsed.sort(key=lambda h: h["x"])

                two_hand_span = 0.0
                main_tip = [0.5, 0.5]

                if len(parsed) == 2 and all(h["gesture"] == "pan" for h in parsed):
                    # 双手模式: 两手都张开 -> 双手间距控制缩放
                    # (像捏着整个星系往两边拉)
                    two_hand_span = round(
                        _dist((parsed[0]["x"], parsed[0]["y"], 0.0),
                              (parsed[1]["x"], parsed[1]["y"], 0.0)), 4)
                    gesture = "twospan"
                    landmarks = parsed[0]["landmarks"]
                    cx = (parsed[0]["x"] + parsed[1]["x"]) / 2
                    cy = (parsed[0]["y"] + parsed[1]["y"]) / 2
                    cz = (parsed[0]["z"] + parsed[1]["z"]) / 2
                    two = (parsed[0]["pinch"] + parsed[1]["pinch"]) / 2
                else:
                    # 单手主导: 优先取正在"指"的那只手, 否则取最靠画面中心的
                    pointing = [h for h in parsed if h["gesture"] == "point"]
                    if pointing:
                        main = pointing[0]
                    else:
                        main = min(parsed, key=lambda h: abs(h["x"]))
                    gesture = main["gesture"]
                    landmarks = main["landmarks"]
                    cx = main["x"]
                    cy = main["y"]
                    cz = main["z"]
                    two = main["pinch"]
                    main_tip = main["tip"]

                state.update({
                    "hand_detected": True,
                    "hand_count": len(parsed),
                    "gesture": gesture,
                    "x": round(cx, 4),
                    "y": round(cy, 4),
                    "z": round(cz, 4),
                    "pinch": round(two, 4),
                    "tip": main_tip,
                    "two_hand_span": two_hand_span,
                    "landmarks": landmarks,
                    "hands": parsed,
                })
            else:
                self._prev_two_finger_dist = None

            with self._lock:
                self.latest = state

            # 预览帧: 缩到 320x240 再 JPEG 编码, 省带宽
            try:
                small = cv2.resize(frame, (320, 240), interpolation=cv2.INTER_AREA)
                ok_jpg, buf = cv2.imencode(".jpg", small, [int(cv2.IMWRITE_JPEG_QUALITY), 60])
                if ok_jpg:
                    with self._lock:
                        self._jpeg = buf.tobytes()
            except Exception:
                pass

    # -- 控制 -------------------------------------------------------------
    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._ready.clear()
        self._startup_error = None
        self._thread = threading.Thread(target=self._run, daemon=True, name="gesture-engine")
        self._thread.start()

        # 等引擎就绪(模型加载 + 摄像头打开)。首启可能需要十几秒, 给足 90 秒。
        if not self._ready.wait(timeout=90):
            log.error("手势引擎启动超时")
            return
        if not self.running:
            log.error("手势引擎启动失败: %s", self._startup_error)
            return
        log.info("手势引擎就绪")

    def stop(self):
        self.running = False
        if self._cap:
            try:
                self._cap.release()
            except Exception:
                pass
        if self._landmarker:
            try:
                self._landmarker.close()
            except Exception:
                pass

    def snapshot(self) -> dict:
        with self._lock:
            return dict(self.latest)

    def latest_jpeg(self) -> bytes | None:
        """取最近一帧的 JPEG 编码(供浏览器预览)。"""
        with self._lock:
            return self._jpeg


# --------------------------------------------------------------------------
# WebSocket + HTTP 服务
# --------------------------------------------------------------------------
class Server:
    def __init__(self, engine: GestureEngine, host: str, port: int):
        self.engine = engine
        self.host = host
        self.port = port
        self.clients: set = set()
        # 调试注入状态(任意客户端设置后, 全局覆盖广播源; None = 恢复真实数据)
        self.injected: dict | None = None

    # -- HTTP 静态文件 ----------------------------------------------------
    async def _http_handler(self, connection, request):
        """
        websockets 的 process_request 钩子: 处理普通 HTTP GET。

        注意: 该钩子对 WebSocket 握手请求也会被调用, 必须放行(返回 None),
        否则握手会被当成静态文件请求返回 200, 客户端报 "rejected ... HTTP 200"。
        """
        # WebSocket 握手 -> 交回给 websockets 自己处理
        upgrade = request.headers.get("Upgrade", "")
        if upgrade and upgrade.lower() == "websocket":
            return None

        from websockets.http11 import Headers, Response

        path = request.path.split("?")[0]
        if path in ("/", ""):
            path = "/index.html"

        rel = path.lstrip("/")
        target = (WEB_DIR / rel).resolve()
        try:
            target.relative_to(WEB_DIR.resolve())
        except ValueError:
            return Response(403, "Forbidden", Headers(), b"forbidden")

        if not target.is_file():
            return Response(404, "Not Found", Headers(), b"not found")

        ctype = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
        headers = Headers()
        headers["Content-Type"] = ctype
        headers["Cache-Control"] = "no-cache"
        body = target.read_bytes()
        return Response(200, "OK", headers, body)

    # -- WebSocket 广播 ---------------------------------------------------
    async def _broadcast_loop(self):
        """
        把最新手势状态推给所有客户端。
        文本帧 = JSON 手势状态, 二进制帧 = JPEG 预览图。
        节流到 ~30fps, JPEG 单独限到 ~15fps 以省带宽。
        """
        last_push = 0.0
        last_jpeg = 0.0
        while True:
            now = time.time()
            if now - last_push < 0.033:
                await asyncio.sleep(0.005)
                continue
            last_push = now

            if not self.clients:
                await asyncio.sleep(0.05)
                continue

            payload = json.dumps(self.injected if self.injected is not None
                                 else self.engine.snapshot())
            # 注入模式下不发预览帧, 保留真实画面
            if self.injected is None:
                jpeg = self.engine.latest_jpeg()
                send_jpeg = jpeg is not None and (now - last_jpeg) >= 0.066
            else:
                send_jpeg = False

            dead = []
            for ws in list(self.clients):
                try:
                    await ws.send(payload)
                    if send_jpeg:
                        await ws.send(jpeg)
                except Exception:
                    dead.append(ws)
            if send_jpeg:
                last_jpeg = now
            for ws in dead:
                self.clients.discard(ws)

    async def _ws_handler(self, websocket):
        """
        处理客户端连接。

        支持调试注入: 客户端发送 JSON 且含 "__inject__" 字段时,
        该状态会覆盖广播源, 直到客户端发送 {"__inject__": null} 或断开连接。
        这样自动化测试可以稳定地驱动前端, 不受真实摄像头数据干扰。
        """
        self.clients.add(websocket)
        log.info("客户端接入: %s (在线 %d)", getattr(websocket, "remote_address", "?"),
                 len(self.clients))
        try:
            async for message in websocket:
                if isinstance(message, bytes):
                    continue
                try:
                    data = json.loads(message)
                except Exception:
                    continue
                if isinstance(data, dict) and "__inject__" in data:
                    self.injected = data["__inject__"]
                    log.info("收到注入状态: %s",
                             "None(恢复真实数据)" if self.injected is None
                             else self.injected.get("gesture"))
        except Exception:
            pass
        finally:
            self.clients.discard(websocket)
            log.info("客户端断开 (在线 %d)", len(self.clients))

    async def run(self):
        from websockets.asyncio.server import serve

        self.engine.start()
        if not self.engine.running:
            log.error("引擎未就绪, 服务退出")
            return

        broadcaster = asyncio.create_task(self._broadcast_loop())

        async with serve(
            self._ws_handler,
            self.host,
            self.port,
            process_request=self._http_handler,
            compression=None,
            max_size=2 ** 20,
        ):
            url = f"http://{self.host}:{self.port}/"
            log.info("=" * 56)
            log.info("  手势太阳系服务已启动")
            log.info("  浏览器打开: %s", url)
            log.info("  WebSocket: ws://%s:%d/", self.host, self.port)
            log.info("=" * 56)
            await asyncio.Future()

        broadcaster.cancel()


# --------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="手势操控太阳系 - 本地 MediaPipe 后端")
    parser.add_argument("--host", default="127.0.0.1", help="监听地址")
    parser.add_argument("--port", type=int, default=8001, help="监听端口")
    parser.add_argument("--cam", type=int, default=0, help="摄像头索引")
    args = parser.parse_args()

    if not MODEL_PATH.exists():
        log.error("缺少模型文件 %s", MODEL_PATH)
        sys.exit(1)

    engine = GestureEngine(cam_index=args.cam)
    server = Server(engine, args.host, args.port)

    try:
        asyncio.run(server.run())
    except KeyboardInterrupt:
        log.info("收到 Ctrl+C, 正在退出...")
    finally:
        engine.stop()


if __name__ == "__main__":
    main()
