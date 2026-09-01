# Furniture Engineering Local Worker Companion

Standalone, Windows-runnable companion application for offloading heavy local AI image-to-3D mesh inference (Hunyuan3D v2.1 via ComfyUI) to user desktop hardware while maintaining deterministic contract compliance with the Furniture Engineering platform.

---

## Architecture Overview

```
 Cloud/AI Studio Web App ──(HTTP Gateway)──► Local Worker Companion ──(HTTP 127.0.0.1:8000)──► Local ComfyUI (Hunyuan3D v2.1)
   (React / Server)                            (Node.js Process)                                 (Python GPU Server)
```

- **Separation of Concerns**: The Web UI and Cloud Backend NEVER connect directly to local host ports (`127.0.0.1:8000`). All compute requests are routed via outbound gateway polling executed by this Local Worker.
- **Strict Data Provenance**: All generated mesh outputs are marked with `productionTruth: false` and tagged with `kind: "ai_reference_mesh"`.

---

## 1. Prerequisites

- **Operating System**: Windows 10 / 11 (64-bit)
- **GPU Hardware**: NVIDIA GPU with 8GB+ VRAM (12GB+ recommended for Hunyuan3D v2.1)
- **Node.js**: Version 18.0.0 or higher
- **ComfyUI Environment**:
  - Local ComfyUI running on `http://127.0.0.1:8000`
  - Hunyuan3D v2.1 Nodes installed (`ComfyUI-Hunyuan3DWrapper` or equivalent)
  - Model Checkpoint: `hunyuan_3d_v2.1.safetensors` placed in `ComfyUI/models/checkpoints/`
  - Custom Output Node: `SaveGLB` node supported

---

## 2. Node.js Installation

1. Download Node.js LTS (v18 or v20) from [nodejs.org](https://nodejs.org/).
2. Run the installer and ensure **"Add to PATH"** is selected.
3. Open a Command Prompt (`cmd.exe`) and verify installation:
   ```cmd
   node -v
   npm -v
   ```

---

## 3. Installation Steps

Navigate to the `local-worker` folder:
```cmd
cd local-worker
npm install
```

---

## 4. Environment Configuration (`.env`)

Copy the template configuration file to create `.env`:
```cmd
copy .env.example .env
```

Default `.env` contents:
```ini
WORKER_GATEWAY_URL=http://localhost:3000/api/worker
LOCAL_WORKER_TOKEN=your_secure_worker_token_here
WORKER_ID=worker-win-01
WORKER_NAME=Windows Local Companion Worker
WORKSPACE_ID=default-ws

POLL_INTERVAL_MS=3000
HEARTBEAT_INTERVAL_MS=5000

COMFYUI_ENABLED=true
COMFYUI_BASE_URL=http://127.0.0.1:8000
COMFYUI_WORKFLOW=workflows/hunyuan3d-v2.1-part-v1.api.json
COMFYUI_INPUT_DIR=temp/input
COMFYUI_OUTPUT_DIR=temp/output
COMFYUI_REQUEST_TIMEOUT_MS=10000
COMFYUI_JOB_TIMEOUT_MS=120000
COMFYUI_POLL_INTERVAL_MS=2000
```

---

## 5. Token Setup (`LOCAL_WORKER_TOKEN`)

The `LOCAL_WORKER_TOKEN` authenticates registration and lease operations with the gateway server.
- Set `LOCAL_WORKER_TOKEN` in `.env` to match the secret configured on your gateway server.
- Example: `LOCAL_WORKER_TOKEN=my_secret_token_98765`

---

## 6. Gateway URL Configuration (`WORKER_GATEWAY_URL`)

- **Local App Integration**: Point to `http://localhost:3000/api/worker`
- **Remote Cloud Gateway**: Point to your deployed AI Studio domain, e.g. `https://your-app-domain.run.app/api/worker`

---

## 7. ComfyUI Port 8000 Configuration

Ensure ComfyUI is launched listening on port 8000 on `127.0.0.1`:
```cmd
python main.py --port 8000 --listen 127.0.0.1
```

> [!CAUTION]
> **CRITICAL SECURITY WARNING**:
> Never bind ComfyUI to `0.0.0.0` or expose port `8000` to the public internet without external authentication. ComfyUI API endpoints allow arbitrary workflow execution and file operations. Keep ComfyUI strictly bound to `127.0.0.1`.

---

## 8. Starting the Worker

### Option A: Windows Batch Script (Recommended)
Double-click `start-worker.bat` or run in Command Prompt:
```cmd
start-worker.bat
```

### Option B: npm CLI
```cmd
npm start
```

---

## 9. Expected READY Logs

When successfully registered and connected, the console will display:
```
[LocalWorker] Registering worker 'worker-win-01' at 'http://localhost:3000/api/worker'...
[LocalWorker] Registered successfully! Heartbeat interval: 5000ms
[LocalWorker] Heartbeat sent (status: idle)
[LocalWorker] Discovered job 'job-1787...' (image_to_mesh). Claiming...
[LocalWorker] Executing task for job 'job-1787...' (provider: comfyui_hunyuan3d)...
[LocalWorker] Job 'job-1787...' completed successfully.
```

---

## 10. Diagnosing OFFLINE / DEGRADED States

Run the diagnostic utility script:
```cmd
check-worker.bat
```

Common State Diagnosis:

| Top Status | Root Cause | Resolution |
| :--- | :--- | :--- |
| **OFFLINE** | Worker process not running or heartbeat expired (>15s) | Run `start-worker.bat` |
| **DEGRADED** | ComfyUI is unreachable or returned HTTP error | Verify ComfyUI is running on port 8000 (`http://127.0.0.1:8000/system_stats`) |
| **NOT CONFIGURED** | Worker token mismatch or zero registered workers | Check `LOCAL_WORKER_TOKEN` in `.env` matches backend |
| **BUSY** | Worker currently processing a Hunyuan3D mesh generation task | Normal operation during generation |

---

## 11. Stopping and Restarting

- **To Stop**: Press `Ctrl + C` in the Command Prompt window running `start-worker.bat`.
- **To Restart**: Run `start-worker.bat` again.

---

## 12. Security & Data Protection

- All API keys, tokens, and filesystem paths are kept local to this worker process and are stripped by the status endpoint before sending diagnostic telemetry to the Web UI.
- All generated meshes maintain `productionTruth: false` and require manual engineering confirmation before entering canonical production pipelines.
