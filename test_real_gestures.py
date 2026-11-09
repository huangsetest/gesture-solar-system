# -*- coding: utf-8 -*-
"""
真实照片手势识别测试
--------------------
用真实拍摄的手势照片(而非合成关键点)验证分类器的准确率。
这是最接近真实使用场景的验证 —— 合成关键点无法反映光照、角度、手型差异。

用法:
  python test_real_gestures.py            # 跑全部
  python test_real_gestures.py --show     # 同时把识别结果画到图上保存
"""

import glob
import os
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

from mediapipe.tasks.python import BaseOptions, vision
from mediapipe.tasks.python.vision.core.image import Image, ImageFormat

from server import MODEL_PATH, classify_gesture

ROOT = Path(__file__).resolve().parent
GDIR = ROOT / "testdata" / "gestures"

# 文件名关键字 -> (期望手势列表, 说明)
# 用关键字匹配, 避免依赖生成图的具体文件名
EXPECT = [
    ("victory",              ["zoomin"],           "V字手势(食指+中指)"),
    ("woman_hands",          ["pan", "pan"],       "双手张开"),
    ("15-43-41",             ["rotate"],           "握拳"),
    ("15-43-55",             ["box"],              "三指"),
    ("15-44-11",             ["point"],            "食指指向"),
    ("two_hum",              ["pan"],              "双手张开(生成图)"),
]

CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 4),
    (0, 5), (5, 6), (6, 7), (7, 8),
    (0, 9), (9, 10), (10, 11), (11, 12),
    (0, 13), (13, 14), (14, 15), (15, 16),
    (0, 17), (17, 18), (18, 19), (19, 20),
    (5, 9), (9, 13), (13, 17),
]


def find_case(key):
    for f in sorted(glob.glob(str(GDIR / "*"))):
        base = os.path.basename(f)
        # 跳过 --show 生成的结果图, 否则会被当成测试样本
        if base.startswith("result_"):
            continue
        if key in base:
            return f
    return None


def draw(img, hands, results):
    """把骨架和判定结果画到图上"""
    out = img.copy()
    h, w = out.shape[:2]
    for (pts, gest) in zip(hands, results):
        color = (0, 255, 100) if gest in ("rotate", "pan") else (0, 200, 255)
        for s, e in CONNECTIONS:
            p1 = (int(pts[s][0] * w), int(pts[s][1] * h))
            p2 = (int(pts[e][0] * w), int(pts[e][1] * h))
            cv2.line(out, p1, p2, color, 2)
        for p in pts:
            cv2.circle(out, (int(p[0] * w), int(p[1] * h)), 4, (0, 220, 255), -1)
        cv2.putText(out, gest, (int(pts[0][0] * w), int(pts[0][1] * h) - 12),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, color, 2)
    return out


def main():
    show = "--show" in sys.argv
    opts = vision.HandLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=str(MODEL_PATH)),
        running_mode=vision.RunningMode.IMAGE,
        num_hands=2,
    )

    # 与服务端一致: 等比缩放到长边 480 再推理
    # (MediaPipe 掌心检测对手部占画面比例敏感, 满幅大图会检不出)
    INFER_LONG = 480

    def prep(img):
        h, w = img.shape[:2]
        s = INFER_LONG / max(h, w)
        if s >= 1.0:
            return img
        return cv2.resize(img, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)

    print("=" * 68)
    print("真实照片手势识别测试 (推理输入等比缩放到长边 480)")
    print("=" * 68)

    total = passed = 0
    details = []

    with vision.HandLandmarker.create_from_options(opts) as lm:
        for key, expect, desc in EXPECT:
            f = find_case(key)
            if not f:
                print(f"  [SKIP] 找不到样本: {key}")
                continue

            img = cv2.imread(f)
            if img is None:
                print(f"  [SKIP] 无法读取: {f}")
                continue
            infer = prep(img)
            rgb = cv2.cvtColor(infer, cv2.COLOR_BGR2RGB)
            res = lm.detect(Image(image_format=ImageFormat.SRGB, data=rgb))
            hands = res.hand_landmarks or []
            pts_list = [[(p.x, p.y, p.z) for p in h] for h in hands]
            results = [classify_gesture(p) for p in pts_list]

            # 期望手势数可能少于实际检出手数(双手图只检出一只时按包含判断)
            exp_set = set(expect)
            got_set = set(results)
            ok = exp_set.issubset(got_set) and len(results) >= len(expect)

            total += 1
            if ok:
                passed += 1

            flag = "OK " if ok else "FAIL"
            name = os.path.basename(f)[:26]
            print(f"  [{flag}] {desc:<22} {name:<28} 期望={list(exp_set)} 实际={results}")

            details.append((f, img, pts_list, results))

            if show:
                out = draw(img, pts_list, results)
                outfile = GDIR / f"result_{os.path.basename(f)}"
                cv2.imwrite(str(outfile), out)
                print(f"         -> {outfile.name}")

    print()
    print("=" * 68)
    print(f"结果: {passed}/{total} 通过")
    print("=" * 68)
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
