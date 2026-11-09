# 手势太阳系 · Gesture Solar System

用**手势操控浏览器里的 3D 太阳系** —— 抬手旋转、缩放、平移视角。

MediaPipe 手势识别跑在**本地 PC 的 Python 端**（模型随 wheel 打包，离线可用），
浏览器端只负责 Three.js 渲染，通过 WebSocket 接收手势数据。

---

## 快速开始

```bat
双击 启动.bat
```

然后浏览器打开 **http://127.0.0.1:8001/**

> 摄像头由 Python 后端独占，浏览器端不需要（也不会）再申请摄像头权限。

---

## 手势操作

| 手势 | 动作 | 说明 |
|------|------|------|
| ✊ 握拳 + 移动 | 旋转视角 | 手往左/右/上/下移，视角跟着转 |
| ✋ 张开手掌 + 移动 | 平移视角 | 整个太阳系在画面里平移 |
| ✌️ 食指 + 中指 | 缩放 | 两指张开 = 拉远，并拢 = 拉近 |
| 🤟 三指 | 最佳视角 | 一键回到推荐机位 |
| 无手 | 自动旋转 | 待机状态缓慢自转 |
| 🖱 鼠标拖拽 / 滚轮 | 旋转 / 缩放 | 手势识别失败时的备用操作 |

建议：手离摄像头 0.5 ~ 1 米，正对镜头，光线充足。

---

## 架构

```
USB 摄像头 (index 0, 640x480)
        ↓
Python server.py
  ├─ OpenCV 抓帧
  ├─ MediaPipe 1.2.2 HandLandmarker (Tasks API, 本地模型)
  ├─ 手势分类 classify_gesture()  ← 关节角度判定
  └─ WebSocket 广播 (单端口同时跑 HTTP 静态服务)
        ↓  文本帧: JSON 手势状态 / 二进制帧: JPEG 预览
浏览器 http://127.0.0.1:8001/
  ├─ gestureClient.js  连接与自动重连
  ├─ app.js            状态消费 + 鼠标兜底控制
  └─ solarSystem.js    Three.js 太阳系渲染 (8行星/8卫星/800小行星/土星环)
```

### 为什么要改架构

原版 GitHub 项目（`aayusxat7/Gesture-Solar`）在**浏览器端**跑 MediaPipe Hands，
依赖 jsdelivr CDN + Google 远程模型文件 —— 国内网络经常卡在模型加载，
且浏览器拿摄像头还要过 HTTPS 和权限两道关。

本项目把 CV 部分全部搬到本地 Python：
- 模型文件本地化（`models/hand_landmarker.task`，7.6MB），**完全离线**
- 延迟更低（USB 摄像头 → 本地 WebSocket，无公网往返）
- 摄像头只被一个进程持有，不会有多进程抢设备的问题

渲染层（Three.js 太阳系）完整保留原作者的实现。

---

## 目录结构

```
gesture_solar/
├── 启动.bat                  ← 双击启动
├── server.py                 ← 后端: 摄像头 + MediaPipe + WebSocket + HTTP
├── test_gesture.py           ← 手势分类器单元测试
├── verify_browser.py         ← 浏览器端渲染验证 (11 项)
├── verify_control.py         ← 手势→相机联动验证 (5 项)
├── verify_gesture_e2e.py     ← 端到端手势识别验证
├── diag_scene.py             ← 场景诊断工具
├── models/
│   └── hand_landmarker.task  ← MediaPipe 模型 (本地)
├── testdata/
│   └── woman_hands.jpg       ← 官方测试图
└── web/
    ├── index.html
    ├── css/style.css
    ├── js/
    │   ├── app.js            ← 主程序
    │   ├── gestureClient.js  ← WebSocket 客户端
    │   ├── solarSystem.js    ← Three.js 太阳系 (源自 GitHub 项目)
    │   └── planetData.js     ← 行星数据
    └── vendor/three.min.js   ← 本地 three.js (不走 CDN)
```

---

## 依赖

已装在 **Python 3.12**（`C:\Users\Administrator\AppData\Local\Programs\Python\Python312`）：

| 包 | 版本 | 用途 |
|----|------|------|
| mediapipe | 1.2.2 | 手部关键点检测（Tasks API） |
| opencv-contrib-python | 5.0.0.93 | 摄像头采集 + JPEG 编码 |
| websockets | 16.0 | WebSocket 服务 |

> ⚠️ MediaPipe 1.x **不支持 Python 3.13**，必须用 3.12。

---

## 常见问题

**画面全黑 / 只有左上角一个小方块？**
画布尺寸没设。已是新版自动修复；若仍异常，刷新页面（Ctrl+F5）强制清缓存。

**提示"后端连接失败"？**
服务没起。检查 `启动.bat` 窗口里的日志，或手动跑 `python server.py --port 8001`。

**摄像头打不开？**
- 端口 8001 被占用：改用 `--port 8080`
- 摄像头被其他程序占用（会议软件/抖音等）：关掉再试
- 换个摄像头：`--cam 1`

**手势识别不准？**
- 手掌正对镜头，别只露指尖
- 光线不足时打开台灯
- 握拳判定用关节角度，手腕朝向偏了会不稳，可以握得更实一些

**想远程访问（手机也能玩）？**
`python server.py --host 0.0.0.0 --port 8001`，然后手机浏览器访问 `http://<PC内网IP>:8001/`

---

## 参考来源

- 渲染层 / 手势映射思路：[aayusxat7/Gesture-Solar](https://github.com/aayusxat7/Gesture-Solar)
- 同类项目参考：
  - [whispering-nature/solar-particle-system](https://github.com/whispering-nature/solar-particle-system)
  - [Sheharyar2000/hand-gesture-universe](https://github.com/Sheharyar2000/hand-gesture-universe)
  - [mrgehlot/hand_gesture_solar_system](https://github.com/mrgehlot/hand_gesture_solar_system)
  - [rihemar/Solar_System_Planets_Simulation](https://github.com/rihemar/Solar_System_Planets_Simulation)（Python 后端 + Three.js 前端，与本项目架构最接近）
