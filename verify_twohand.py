# -*- coding: utf-8 -*-
"""
双手与放大能力验证
------------------
1. 双手间距缩放 (twospan): 间距变大 -> 拉近
2. 食指指向行星 (point): 射线命中 -> 聚焦 + 相机跟随
3. 缩放范围上限放开: 能拉到 8 (极近) 和 600 (极远)
4. 双手骨架绘制

运行:  python verify_twohand.py
"""

import asyncio
import json
import sys
from pathlib import Path

import websockets
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent
URL = "http://127.0.0.1:8001/"


def mk(g, x=0.0, y=0.0, z=0.0, tip=None, span=0.0, hands=None):
    return {
        "hand_detected": True,
        "gesture": g,
        "x": x, "y": y, "z": z,
        "landmarks": [],
        "fps": 30.0,
        "pinch": 0.1,
        "tip": tip or [0.5, 0.5],
        "hand_count": 2 if hands else 1,
        "hands": hands or [],
        "two_hand_span": span,
    }


class Injector:
    """通过后端的调试注入通道推送手势状态(会覆盖真实摄像头数据)。"""

    def __init__(self):
        self.ws = None

    async def __aenter__(self):
        self.ws = await websockets.connect("ws://127.0.0.1:8001/")
        return self

    async def __aexit__(self, *a):
        try:
            await self.ws.send(json.dumps({"__inject__": None}))
            await asyncio.sleep(0.2)
        except Exception:
            pass
        await self.ws.close()

    async def send(self, state):
        await self.ws.send(json.dumps({"__inject__": state}))
        await asyncio.sleep(0.15)


async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.connect_over_cdp("http://127.0.0.1:9222")
        ctx = b.contexts[0]
        page = await ctx.new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        await page.goto(URL, wait_until="load", timeout=30000)
        await page.wait_for_timeout(4000)

        async def probe():
            return await page.evaluate(
                """() => {
                  const ss = window.app.solarSystem;
                  return {
                    dist: +ss.targetDistance.toFixed(2),
                    minD: ss.minDistance, maxD: ss.maxDistance,
                    panX: +ss.targetPanX.toFixed(2),
                    panY: +ss.targetPanY.toFixed(2),
                    mode: ss.controlMode,
                    focused: ss.focusedName,
                    focusDist: ss._focusTargetDistance ? +ss._focusTargetDistance.toFixed(2) : null,
                    hasLabel: !!ss.focusedLabel,
                    camDist: +ss.cameraDistance.toFixed(2)
                  };
                }"""
            )

        async def inject(state):
            await injector.send(state)

        results = []

        injector = Injector()
        await injector.__aenter__()

        # ---- 1. 缩放范围已放开 ----
        r = await probe()
        results.append(("缩放范围下限 = 8", r["minD"] == 8, f"minDistance={r['minD']}"))
        results.append(("缩放范围上限 = 600", r["maxD"] == 600, f"maxDistance={r['maxD']}"))

        # ---- 2. 双手间距缩放: 间距变大 -> 拉近 ----
        # 先建立基准 span
        await inject(mk("twospan", span=0.5))
        await page.wait_for_timeout(400)
        before = await probe()
        await inject(mk("twospan", span=0.95))   # 双手分开
        await page.wait_for_timeout(500)
        after = await probe()
        results.append(("双手分开 -> 拉近", after["dist"] < before["dist"],
                        f"dist {before['dist']} -> {after['dist']}"))

        # 双手靠拢 -> 拉远
        await inject(mk("twospan", span=0.95))
        await page.wait_for_timeout(400)
        before = await probe()
        await inject(mk("twospan", span=0.2))  # 双手靠拢
        await page.wait_for_timeout(500)
        after = await probe()
        results.append(("双手靠拢 -> 拉远", after["dist"] > before["dist"],
                        f"dist {before['dist']} -> {after['dist']}"))

        # ---- 3. 能拉到很近 (小于 50, 原来做不到) ----
        # 用双手持续分开拉近, 验证缩放下限已从 50 降到 8
        await inject(mk("twospan", span=0.3))
        await page.wait_for_timeout(300)
        await inject(mk("twospan", span=0.9))
        await page.wait_for_timeout(300)
        await inject(mk("twospan", span=1.4))
        await page.wait_for_timeout(600)
        r = await probe()
        results.append(("能拉到 50 以下(原限制)", r["dist"] < 50, f"dist={r['dist']}"))

        # ---- 4. 食指指向行星 -> 聚焦 ----
        # 必须先回到最佳视角(距离 180), 否则画面里可能没有天体可指
        await inject(mk("box"))
        await page.wait_for_timeout(1500)
        r = await probe()
        print(f"  [前置] 已回最佳视角 dist={r['dist']}")
        # 指向画面中心 -> 应该命中太阳
        await inject(mk("point", tip=[0.5, 0.5]))
        await page.wait_for_timeout(600)
        await inject(mk("point", tip=[0.5, 0.5]))
        await page.wait_for_timeout(600)
        r = await probe()
        results.append(("指向中心 -> 命中天体", r["focused"] is not None,
                        f"focused={r['focused']}"))

        # ---- 4b. 握拳应退出聚焦 ----
        if r["focused"] is not None:
            await inject(mk("rotate", x=0.0, y=0.0))
            await page.wait_for_timeout(400)
            r2 = await probe()
            results.append(("握拳退出聚焦", r2["focused"] is None,
                            f"focused={r2['focused']}"))

        # ---- 5. 双手骨架数据到达前端 ----
        hands_payload = [
            {"gesture": "pan", "x": -0.5, "y": 0.0, "z": 0.0, "pinch": 0.1,
             "tip": [0.25, 0.5],
             "landmarks": [[0.25 + i * 0.01, 0.5 + (i % 5) * 0.02, 0.0] for i in range(21)]},
            {"gesture": "pan", "x": 0.5, "y": 0.0, "z": 0.0, "pinch": 0.1,
             "tip": [0.75, 0.5],
             "landmarks": [[0.75 + i * 0.01, 0.5 + (i % 5) * 0.02, 0.0] for i in range(21)]},
        ]
        await inject(mk("twospan", span=0.8, hands=hands_payload))
        await page.wait_for_timeout(400)
        drawn = await page.evaluate(
            "() => { const c = document.getElementById('videoOverlay');"
            "const d = c.getContext('2d').getImageData(0,0,c.width,c.height).data;"
            "let n=0; for(let i=3;i<d.length;i+=4) if(d[i]>0) n++;"
            "return n; }")
        results.append(("双手骨架已绘制", drawn > 100, f"非透明像素={drawn}"))

        print("=" * 64)
        print("双手与放大能力验证")
        print("=" * 64)
        all_ok = True
        for name, ok, detail in results:
            print(f"  [{'OK ' if ok else 'FAIL'}] {name:<24} {detail}")
            if not ok:
                all_ok = False

        if errs:
            print(f"\nJS 错误: {errs[:5]}")

        await page.screenshot(path=str(ROOT / "screenshot.png"))
        print(f"\n总体: {'全部通过' if all_ok else '存在失败项'}")
        await injector.__aexit__()
        await page.close()
        await b.close()
        return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
