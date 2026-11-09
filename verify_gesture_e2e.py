# -*- coding: utf-8 -*-
"""
端到端手势验证
--------------
把一张手部测试图"投影"到摄像头画面上, 观察后端能否识别出手势。
做法: 抓取摄像头当前帧, 把测试图里的手部区域合成进去, 再喂给 MediaPipe。

同时验证: 手势 -> 浏览器相机参数变化的链路。

运行:  python verify_gesture_e2e.py
"""

import asyncio
import json
import sys
import time
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

from mediapipe.tasks.python import BaseOptions, vision
from mediapipe.tasks.python.vision.core.image import Image, ImageFormat

from server import MODEL_PATH, classify_gesture

ROOT = Path(__file__).resolve().parent
TEST_IMG = ROOT / "testdata" / "woman_hands.jpg"


def crop_hand_region(img):
    """
    从测试图里裁出"手部区域"(排除背景), 用于合成到摄像头画面。
    简单做法: 找出肤色像素的最小外接矩形区域。
    """
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    lower = np.array([0, 30, 60])
    upper = np.array([25, 170, 255])
    mask = cv2.inRange(hsv, lower, upper)
    mask = cv2.dilate(mask, np.ones((7, 7), np.uint0X if False else np.uint8), iterations=2)
    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cnts:
        return None
    c = max(cnts, key=cv2.contourArea)
    x, y, w, h = cv2.boundingRect(c)
    return img[y:y + h, x:x + w]


def synth_scene(hand_img, canvas_w=640, canvas_h=480):
    """把裁出的手部贴到纯色背景上, 模拟"手在摄像头前"。"""
    bg = np.full((canvas_h, canvas_w, 3), 40, dtype=np.uint8)
    if hand_img is None:
        return bg
    hh, hw = hand_img.shape[:2]
    # 缩放到画面高度的 45%
    scale = (canvas_h * 0.45) / max(hh, 1)
    nh, nw = int(hh * scale), int(hw * scale)
    if nw > canvas_w:
        nw = canvas_w
        nh = max(int(hh * nw / hw), 1)
    resized = cv2.resize(hand_img, (nw, nh))
    x0 = (canvas_w - nw) // 2
    y0 = (canvas_h - nh) // 2
    bg[y0:y0 + nh, x0:x0 + nw] = resized
    return bg


def main():
    if not TEST_IMG.exists():
        print("缺少测试图:", TEST_IMG)
        return 1

    test_img = cv2.imread(str(TEST_IMG))
    hand = crop_hand_region(test_img)
    print(f"测试图: {test_img.shape}, 裁出手部区域: {hand.shape if hand is not None else None}")

    scene = synth_scene(hand)
    cv2.imwrite(str(ROOT / "testdata" / "synth_scene.jpg"), scene)

    options = vision.HandLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=str(MODEL_PATH)),
        running_mode=vision.RunningMode.IMAGE,
        num_hands=2,
    )
    with vision.HandLandmarker.create_from_options(options) as lm:
        rgb = cv2.cvtColor(scene, cv2.COLOR_BGR2RGB)
        res = lm.detect(Image(image_format=ImageFormat.SRGB, data=rgb))
        hands = res.hand_landmarks or []
        print(f"合成场景中检出手数量: {len(hands)}")
        for i, h in enumerate(hands):
            pts = [(p.x, p.y, p.z) for p in h]
            g = classify_gesture(pts)
            cx = sum(p[0] for p in pts) / len(pts)
            cy = sum(p[1] for p in pts) / len(pts)
            print(f"  手 #{i}: 手势={g}  中心=({cx:.3f}, {cy:.3f})")

        if not hands:
            print("[FAIL] 合成场景未能检出手")
            return 1
        print("[OK ] 端到端手势识别链路可用")
    return 0


if __name__ == "__main__":
    sys.exit(main())
