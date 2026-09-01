@echo off
title Local AI Worker Process
echo =================================================================
echo           Furniture Engineering Local Worker Starter
echo =================================================================

:: Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH!
    echo Please install Node.js v18+ from https://nodejs.org/
    pause
    exit /b 1
)

:: Check .env file
if not exist .env (
    echo [WARNING] .env file not found. Copying from .env.example...
    copy .env.example .env
    echo [NOTICE] Please review and configure .env with your LOCAL_WORKER_TOKEN and WORKER_GATEWAY_URL.
)

:: Ensure node_modules exists
if not exist node_modules (
    echo [INFO] Installing worker dependencies...
    call npm install
)

echo.
echo [INFO] Starting Local Worker process...
call npm start

pause
