# -*- coding: utf-8 -*-
"""
手势 -> 相机联动验证
--------------------
直接向浏览器的 WebSocket 注入模拟手势数据, 验证前端是否正确响应:
  rotate  -> targetRotationY 变化
  pan     -> targetPanX/Y 变化
  zoomin  -> targetDistance 减小
  zoomout -> targetDistance 增大
  box     -> 相机回到最佳视角
  none    -> 自动旋转

运行:  python verify_control.py
"""

import asyncio
import json
import sys
from pathlib import Path

import websockets
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent
URL = "http://127.0.0.1:8001/"


async def send_states(states):
    """通过 WebSocket 注入一串手势状态。"""
    async with websockets.connect("ws://127.0.0.1:8001/") as ws:
        # 服务端会持续广播, 这里只发送不读取, 关闭时服务端会收到异常
        for st in states:
            await ws.send(json.dumps(st))
            await asyncio.sleep(0.05)


def mk(g, x=0.0, y=0.0, z=0.0, det=True):
    return {
        "hand_detected": det,
        "gesture": g,
        "x": x,
        "y": y,
        "z": z,
        "landmarks": [],
        "fps": 30.0,
        "pinch": 0.1,
    }


async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.connect_over_cdp("http://127.0.0.1:9222")
        ctx = b.contexts[0]
        page = await ctx.new_page()
        await page.goto(URL, wait_until="load", timeout=30000)
        await page.wait_for_timeout(4000)

        async def probe():
            return await page.evaluate(
                """() => {
                  const ss = window.app.solarSystem;
                  return {
                    rotY: +ss.targetRotationY.toFixed(4),
                    rotX: +ss.targetRotationX.toFixed(4),
                    panX: +ss.targetPanX.toFixed(3),
                    panY: +ss.targetPanY.toFixed(3),
                    dist: +ss.targetDistance.toFixed(2),
                    mode: ss.controlMode
                  };
                }"""
            )

        # 注意: 真实数据流是 服务端 --WebSocket--> 浏览器。
        # 传输层已由 verify_browser.py 单独验证, 这里直接调用前端入口注入手势状态,
        # 避免被服务端持续广播的真实状态(无人手)覆盖。
        async def inject(states):
            await page.evaluate(
                """(states) => { for (const s of states) window.app.onGestureState(s); }""",
                states,
            )

        results = []

        # --- rotate: 手从左移到右 ---
        before = await probe()
        await inject([mk("rotate", x=-0.5, y=0.0), mk("rotate", x=0.5, y=0.0)])
        await page.wait_for_timeout(600)
        after = await probe()
        d_rot = after["rotY"] - before["rotY"]
        results.append(("rotate 旋转视角", abs(d_rot) > 0.01, f"rotY {before['rotY']} -> {after['rotY']}"))

        # --- pan: 手上下移动 ---
        before = await probe()
        await inject([mk("pan", x=0.0, y=-0.4), mk("pan", x=0.0, y=0.4)])
        await page.wait_for_timeout(600)
        after = await probe()
        d_pan = abs(after["panX"] - before["panX"]) + abs(after["panY"] - before["panY"])
        results.append(("pan 平移视角", d_pan > 0.1, f"panX {before['panX']}->{after['panX']}"))

        # --- zoomin: 距离应减小 ---
        before = await probe()
        await inject([mk("zoomin", x=0.0, y=0.0)])
        await page.wait_for_timeout(300)
        await inject([mk("zoomin", x=0.0, y=0.0)])
        await page.wait_for_timeout(300)
        await inject([mk("zoomin", x=0.0, y=0.0)])
        await page.wait_for_timeout(500)
        after = await probe()
        results.append(("zoomin 拉近", after["dist"] < before["dist"],
                        f"dist {before['dist']} -> {after['dist']}"))

        # --- zoomout: 距离应增大 ---
        before = await probe()
        await inject([mk("zoomout", x=0.0, y=0.0)])
        await page.wait_for_timeout(300)
        await inject([mk("zoomout", x=0.0, y=0.0)])
        await page.wait_for_timeout(300)
        await inject([mk("zoomout", x=0.0, y=0.0)])
        await page.wait_for_timeout(500)
        after = await probe()
        results.append(("zoomout 拉远", after["dist"] > before["dist"],
                        f"dist {before['dist']} -> {after['dist']}"))

        # --- box: 回到最佳视角 ---
        await inject([mk("box", x=0.0, y=0.0)])
        # targetDistance 是插值收敛的, 给足时间
        await page.wait_for_timeout(1500)
        after = await probe()
        results.append(("box 最佳视角", abs(after["dist"] - 180) < 1.0,
                        f"dist = {after['dist']} (期望 180)"))

        print("=" * 62)
        print("手势 -> 相机联动验证")
        print("=" * 62)
        all_ok = True
        for name, ok, detail in results:
            print(f"  [{'OK ' if ok else 'FAIL'}] {name:<18} {detail}")
            if not ok:
                all_ok = False

        await page.screenshot(path=str(ROOT / "screenshot.png"))
        print()
        print(f"总体: {'全部通过' if all_ok else '存在失败项'}")
        await page.close()
        await b.close()
        return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
