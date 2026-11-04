@echo off
chcp 936 >nul
cd /d "%~dp0"
if not exist "logs\splash.log" (
  echo 还没有日志，先双击桌面的快捷方式跑一次。
  pause
  exit /b
)
start "" notepad "logs\splash.log"
