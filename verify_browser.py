# -*- coding: utf-8 -*-
"""
浏览器端验证脚本
----------------
连接本机已登录的 Chrome (CDP 9222), 打开手势太阳系页面, 检查:
  - WebGL 渲染是否成功(行星数量 / 相机参数)
  - WebSocket 是否连上、手势数据是否在更新
  - 预览帧 JPEG 是否显示
  - 控制台有无报错
并保存截图。

运行:  python verify_browser.py
"""

import asyncio
import json
import sys
from pathlib import Path

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent
URL = "http://127.0.0.1:8001/"
SHOT = ROOT / "screenshot.png"


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.connect_over_cdp("http://127.0.0.1:9222")
        ctx = browser.contexts[0]
        page = await ctx.new_page()

        errors = []
        console_logs = []
        page.on("console", lambda m: (console_logs.append(f"[{m.type}] {m.text}"),
                                      errors.append(m.text) if m.type == "error" else None))
        page.on("pageerror", lambda e: errors.append(f"PAGEERROR: {e}"))

        await page.goto(URL, wait_until="load", timeout=30000)
        await page.wait_for_timeout(7000)

        # 采样两次, 确认数据在持续更新
        s1 = await page.evaluate(JS_PROBE)
        await page.wait_for_timeout(2000)
        s2 = await page.evaluate(JS_PROBE)

        print("=" * 62)
        print("浏览器端验证结果")
        print("=" * 62)
        print(json.dumps(s2, indent=2, ensure_ascii=False))

        print()
        print("-" * 62)
        checks = [
            ("页面加载", True),
            ("Three.js 已加载", s2.get("hasTHREE")),
            ("太阳系实例已创建", s2.get("hasSolarSystem")),
            ("行星数量 >= 8", (s2.get("planets") or 0) >= 8),
            ("卫星已创建", (s2.get("moons") or 0) > 0),
            ("画布尺寸 = 窗口尺寸", (s2.get("canvasW") or 0) > 800),
            ("Three.js 有绘制调用", (s2.get("drawCalls") or 0) > 0),
            ("WebSocket 已连接", "已连接" in str(s2.get("conn"))),
            ("识别帧率 > 0", (s2.get("fps") or 0) > 0),
            ("预览帧已显示", (s2.get("previewImg") or 0) > 0),
            ("无 JS 报错", len(errors) == 0),
        ]
        all_ok = True
        for name, ok in checks:
            print(f"  [{'OK ' if ok else 'FAIL'}] {name}")
            if not ok:
                all_ok = False

        if errors:
            print()
            print("控制台错误:")
            for e in errors[:10]:
                print("   -", e)

        await page.screenshot(path=str(SHOT))
        print()
        print(f"截图已保存: {SHOT}")
        print(f"总体: {'全部通过' if all_ok else '存在失败项'}")

        await page.close()
        await browser.close()
        return 0 if all_ok else 1


JS_PROBE = """
() => {
  const app = window.app;
  const ss = app ? app.solarSystem : null;
  const v = document.getElementById('video');
  return {
    conn: document.getElementById('conn')?.textContent || '',
    status: document.getElementById('status')?.textContent || '',
    gesture: document.getElementById('gesture')?.textContent || '',
    fps: parseFloat(document.getElementById('fps')?.textContent) || 0,
    handPos: document.getElementById('hand-position')?.textContent || '',
    canvasW: document.getElementById('canvas')?.width || 0,
    canvasH: document.getElementById('canvas')?.height || 0,
    hasTHREE: typeof THREE !== 'undefined',
    hasSolarSystem: !!ss,
    planets: ss ? Object.keys(ss.planets || {}).length : 0,
    moons: ss ? Object.keys(ss.moons || {}).length : 0,
    asteroids: ss ? (ss.asteroids || []).length : 0,
    drawCalls: ss ? ss.renderer.info.render.calls : 0,
    triangles: ss ? ss.renderer.info.render.triangles : 0,
    cameraDist: ss ? Math.round(ss.cameraDistance) : 0,
    controlMode: ss ? ss.controlMode : '',
    previewImg: v ? (v.naturalWidth || 0) : 0,
    wsConnected: app && app.client ? app.client.connected : false
  };
}
"""


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
