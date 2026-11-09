@echo off
chcp 65001 >nul
title 手势太阳系 - Gesture Solar System

cd /d "%~dp0"

set PY="C:\Users\Administrator\AppData\Local\Programs\Python\Python312\python.exe"

echo ========================================================
echo   手势太阳系 启动中...
echo ========================================================
echo.

%PY% server.py --port 8001

echo.
echo 服务已退出。按任意键关闭...
pause >nul
