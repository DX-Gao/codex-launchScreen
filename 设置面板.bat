@echo off
title Dragon Splash Boot - 设置
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [错误] 没有检测到 Node.js
  echo  请先安装：https://nodejs.org
  echo.
  pause
  exit /b 1
)

echo  正在打开设置面板...
echo  关闭这个窗口 = 停止服务
echo.

node server.js

echo.
echo  服务已停止。
pause
