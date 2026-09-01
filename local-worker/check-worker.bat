@echo off
title Local AI Worker Health Diagnostic Check
echo =================================================================
echo         Furniture Engineering Local Worker Health Diagnostic
echo =================================================================

:: 1. Node.js Check
echo.
echo [1/3] Checking Node.js Environment...
node -v >nul 2>nul
if %errorlevel% neq 0 (
    echo [FAIL] Node.js is NOT installed or NOT available in PATH.
) else (
    for /f "tokens=*" %%v in ('node -v') do echo [PASS] Node.js detected: %%v
)

:: 2. ComfyUI Connection Check (Port 8000)
echo.
echo [2/3] Checking Local ComfyUI Server (http://127.0.0.1:8000/system_stats)...
powershell -Command "try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:8000/system_stats' -TimeoutSec 3; Write-Host '[PASS] ComfyUI is ONLINE and responding at http://127.0.0.1:8000' -ForegroundColor Green } catch { Write-Host '[FAIL] ComfyUI is OFFLINE or unaccessible at http://127.0.0.1:8000' -ForegroundColor Red }"

:: 3. Gateway Connectivity Check
echo.
echo [3/3] Checking Gateway API Connectivity...
powershell -Command "try { $r = Invoke-RestMethod -Uri 'http://localhost:3000/api/worker/status' -TimeoutSec 3; Write-Host ('[PASS] Cloud Gateway responds: topStatus=' + $r.data.topStatus + ', localWorker=' + $r.data.localWorker) -ForegroundColor Green } catch { Write-Host '[WARNING] Cloud Gateway at http://localhost:3000/api/worker/status is currently unreachable (ensure Cloud App is running)' -ForegroundColor Yellow }"

echo.
echo =================================================================
echo Diagnostic check finished. Press any key to exit.
pause >nul
