# -*- coding: utf-8 -*-
"""
手势分类器单元验证
------------------
用官方测试图 + 合成的手部关键点, 验证 classify_gesture() 的判定是否符合预期。
运行:  python test_gesture.py
"""

import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

from mediapipe.tasks.python import BaseOptions, vision
from mediapipe.tasks.python.vision.core.image import Image, ImageFormat

from server import MODEL_PATH, classify_gesture

TEST_IMG = Path(__file__).resolve().parent / "testdata" / "woman_hands.jpg"


def test_real_image():
    """真实图片: 应该能检出 2 只手, 且分类为张开手掌(pan)。"""
    print("=" * 60)
    print("测试 1: 官方测试图 woman_hands.jpg")
    print("=" * 60)

    if not TEST_IMG.exists():
        print("  [SKIP] 缺少测试图片:", TEST_IMG)
        return True

    options = vision.HandLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=str(MODEL_PATH)),
        running_mode=vision.RunningMode.IMAGE,
        num_hands=2,
    )
    with vision.HandLandmarker.create_from_options(options) as lm:
        img = cv2.imread(str(TEST_IMG))
        rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        res = lm.detect(Image(image_format=ImageFormat.SRGB, data=rgb))

        hands = res.hand_landmarks or []
        print(f"  检测到手数量: {len(hands)}")
        assert len(hands) >= 1, "应至少检出 1 只手"

        ok = True
        for i, h in enumerate(hands):
            pts = [(p.x, p.y, p.z) for p in h]
            g = classify_gesture(pts)
            print(f"    手 #{i}: 手势 = {g}")
            # 官方测试图是张开的手掌
            if g != "pan":
                print(f"      [WARN] 期望 pan, 实际 {g}")
                ok = False
        return ok


def _make_hand(fingers_up: dict, wrist=(0.5, 0.9), scale=0.15):
    """
    合成一个 21 点手部关键点。
    fingers_up 键位与 MediaPipe 手指编号一致:
        0=拇指, 1=食指, 2=中指, 3=无名指, 4=小指
    坐标系: x 向右, y 向上(与 MediaPipe 归一化坐标一致, y 越小越靠上)
    """
    lm = np.zeros((21, 3), dtype=float)
    lm[0] = (wrist[0], wrist[1], 0.0)

    # 掌指关节位置 (index, middle, ring, pinky 的 MCP)
    mcp_x = [0.38, 0.46, 0.54, 0.61]
    # 每个手指: MCP, PIP, DIP, TIP 的 x 偏移与长度
    finger_len = [0.30, 0.36, 0.33, 0.27]
    # 拇指
    thumb_idx = [1, 2, 3, 4]
    thumb_pos = [(0.32, 0.78), (0.26, 0.68), (0.21, 0.60), (0.17, 0.54)]

    # 拇指: 伸出时指尖远离小指根, 收回时贴近掌心
    thumb_up = fingers_up.get(0, True)
    if thumb_up:
        for k, idx in enumerate(thumb_idx):
            lm[idx] = (thumb_pos[k][0], thumb_pos[k][1], 0.0)
    else:
        # 收回: 拇指压在食指根/掌心附近, 指尖靠近食指根(0.38, 0.72)
        lm[thumb_idx[0]] = (0.30, 0.75, 0.0)
        lm[thumb_idx[1]] = (0.32, 0.73, 0.0)
        lm[thumb_idx[2]] = (0.35, 0.72, 0.0)
        lm[thumb_idx[3]] = (0.375, 0.71, 0.0)

    for f in range(4):
        base = 5 + f * 4  # 5,9,13,17
        mx, my = mcp_x[f], 0.72
        L = finger_len[f]
        # 手指编号: 1=食指, 2=中指, 3=无名指, 4=小指
        up = fingers_up.get(f + 1, True)

        lm[base + 0] = (mx, my, 0.0)                       # MCP
        if up:
            lm[base + 1] = (mx, my + L * 0.40, 0.0)        # PIP
            lm[base + 2] = (mx, my + L * 0.70, 0.0)        # DIP
            lm[base + 3] = (mx, my + L * 1.00, 0.0)        # TIP
        else:
            # 弯曲(握拳): PIP 向掌心折, DIP/TIP 再折回来, 形成明显折角
            lm[base + 1] = (mx, my + L * 0.34, 0.0)                  # PIP 上抬
            lm[base + 2] = (mx + 0.035, my + L * 0.30, 0.0)          # DIP 回勾
            lm[base + 3] = (mx + 0.055, my + L * 0.05, 0.0)          # TIP 收进掌心

    return lm


def test_synthetic():
    """合成关键点: 精确验证各手势的分类结果。"""
    print()
    print("=" * 60)
    print("测试 2: 合成关键点 -> 手势分类")
    print("=" * 60)

    cases = [
        ("全部握拳 (0 指)", {0: False, 1: False, 2: False, 3: False, 4: False}, "rotate"),
        ("张开手掌 (5 指)", {0: True, 1: True, 2: True, 3: True, 4: True}, "pan"),
        ("食指+中指 (V)", {0: False, 1: True, 2: True, 3: False, 4: False}, "zoomin"),
        ("三指", {0: False, 1: True, 2: True, 3: True, 4: False}, "box"),
    ]

    all_ok = True
    for name, fingers, expect in cases:
        lm = _make_hand(fingers)
        got = classify_gesture([tuple(p) for p in lm])
        flag = "OK " if got == expect else "FAIL"
        if got != expect:
            all_ok = False
        print(f"  [{flag}] {name:<22} 期望={expect:<8} 实际={got}")

    return all_ok


if __name__ == "__main__":
    r1 = test_real_image()
    r2 = test_synthetic()
    print()
    print("=" * 60)
    print(f"总体结果: 真实图片={'通过' if r1 else '失败'}  合成用例={'通过' if r2 else '失败'}")
    print("=" * 60)
    sys.exit(0 if (r1 and r2) else 1)
