@echo off
chcp 936 >nul
title Dragon Splash Boot - 构建
cd /d "%~dp0"

where dotnet >nul 2>nul
if errorlevel 1 (
  echo  [错误] 没有检测到 .NET SDK
  echo  请安装：https://dotnet.microsoft.com/download/dotnet/8.0
  pause
  exit /b 1
)

echo  正在构建...
echo.
dotnet publish dotnet/CodexSplash.csproj -c Release -o app
if errorlevel 1 (
  echo.
  echo  构建失败，请查看上面的错误。
  pause
  exit /b 1
)

echo.
echo  构建完成，产物在 app\ 目录。
echo  接下来可以双击「创建桌面快捷方式.vbs」生成桌面入口。
pause
