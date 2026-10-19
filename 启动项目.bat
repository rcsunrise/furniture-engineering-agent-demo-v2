@echo off
chcp 65001 >nul
title 家具工程智能平台 · Furniture Engineering Agent
echo ========================================================
echo   家具工程智能平台 · Furniture Engineering Agent
echo ========================================================
echo.

set "LOCAL_NODE=%LOCALAPPDATA%\Programs\nodejs"
if exist "%LOCAL_NODE%\node.exe" (
    set "PATH=%LOCAL_NODE%;%PATH%"
)

echo [1/3] 检查 Node.js 运行环境...
node -v
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js，请确保已安装 Node.js。
    pause
    exit /b 1
)

echo [2/3] 准备打开浏览器...
start "" http://localhost:3000

echo [3/3] 正在启动服务 (端口 3000)...
npm run dev
pause
