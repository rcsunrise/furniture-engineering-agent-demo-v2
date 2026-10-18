import React, { useState, useEffect } from "react";
import {
  Cloud,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Upload,
  FileText,
  ShieldCheck,
  ExternalLink,
  Terminal,
  FileCode,
  HardDrive,
  Check,
  Copy,
} from "lucide-react";
import { engineeringArtifactApi } from "../../services/engineeringArtifactApi.js";
import type {
  EngineeringArtifact,
  StorageConfigResponse,
} from "../../../shared/engineeringArtifact.js";

interface TestArtifactResult {
  artifactId: string;
  bucket: string;
  objectPath: string;
  sizeBytes: number;
  status: string;
  uploadStorageProvider: "gcs" | "local_fallback";
  accessUrl?: string;
  verifiedContent?: string;
}

export interface SignedUrlTestState {
  tested: boolean;
  url: string;
  signedUrlProvider: "gcs" | "local_fallback";
  isRealCloudSignedUrl: boolean;
  readBack: "PASS" | "FAIL";
  content: string;
}

/**
 * Validates if the signed URL host is genuine Google Cloud Storage.
 * Local proxy routes (/api/engineering/storage/local-access/...) strictly return false.
 */
export function isGcsSignedUrlHost(urlStr: string): boolean {
  if (!urlStr || urlStr.startsWith("/api/engineering/storage/local-access/")) {
    return false;
  }
  try {
    const parsed = new URL(urlStr, typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");
    const host = parsed.hostname.toLowerCase();
    return (
      host === "storage.googleapis.com" ||
      host.endsWith(".storage.googleapis.com") ||
      host === "commondatastorage.googleapis.com"
    );
  } catch {
    return false;
  }
}

export function StorageDiagnosticsPanel() {
  const [storageConfig, setStorageConfig] = useState<StorageConfigResponse | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [configError, setConfigError] = useState<{ code: string; message: string } | null>(null);
  const [contractError, setContractError] = useState<string | null>(null);

  // Test 2: Upload Test TXT
  const [uploadingTxt, setUploadingTxt] = useState(false);
  const [txtResult, setTxtResult] = useState<TestArtifactResult | null>(null);
  const [txtError, setTxtError] = useState<{ code: string; message: string } | null>(null);

  // Test 3: Signed URL Read
  const [testingSignedUrl, setTestingSignedUrl] = useState(false);
  const [probingSigning, setProbingSigning] = useState(false);
  const [signedUrlState, setSignedUrlState] = useState<SignedUrlTestState | null>(null);
  const [acquiredSignedUrl, setAcquiredSignedUrl] = useState<string | null>(null);
  const [signedUrlError, setSignedUrlError] = useState<{
    code: string;
    message: string;
    status?: number;
    provider?: string;
    fallbackUsed?: boolean;
    permissionIssueType?: string;
    isCorsIssue?: boolean;
    signedUrl?: string;
  } | null>(null);

  // Test 4: Local File Upload Smoke Test
  const [localFile, setLocalFile] = useState<File | null>(null);
  const [uploadingLocalFile, setUploadingLocalFile] = useState(false);
  const [localUploadProgress, setLocalUploadProgress] = useState(0);
  const [localFileResult, setLocalFileResult] = useState<{
    artifact: EngineeringArtifact;
    accessUrl: string;
  } | null>(null);
  const [localFileError, setLocalFileError] = useState<{ code: string; message: string } | null>(null);

  // Operational Activity Logs
  const [logs, setLogs] = useState<Array<{ time: string; text: string; type: "info" | "success" | "warn" | "error" }>>([]);

  const addLog = (text: string, type: "info" | "success" | "warn" | "error" = "info") => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [{ time, text, type }, ...prev.slice(0, 49)]);
  };

  // 1. Check Storage Config
  const handleCheckConfig = async () => {
    setLoadingConfig(true);
    setConfigError(null);
    setContractError(null);
    setStorageConfig(null);
    addLog("正在查询 GET /api/engineering/storage/config...", "info");

    try {
      const res = await engineeringArtifactApi.getStorageConfig();

      // Check Contract Completeness
      const isMalformed =
        !res ||
        typeof res.success !== "boolean" ||
        typeof res.gcsEnabled !== "boolean" ||
        !res.provider ||
        typeof res.fallbackMode !== "boolean" ||
        !res.config ||
        !res.bucketsCheck ||
        typeof res.bucketsCheck.assetBucket !== "boolean" ||
        typeof res.bucketsCheck.tempBucket !== "boolean";

      if (isMalformed) {
        setContractError("响应结构缺失必要字段 (bucketsCheck, provider, fallbackMode 或 config)。");
        addLog("CONTRACT_ERROR: /api/engineering/storage/config 响应缺少规范契约字段。", "error");
        return;
      }

      // Atomic update
      setStorageConfig({
        success: res.success,
        provider: res.provider,
        fallbackMode: res.fallbackMode,
        gcsEnabled: res.gcsEnabled,
        config: res.config,
        bucketsCheck: res.bucketsCheck,
        backendServiceIdentity: res.backendServiceIdentity,
      });

      const isRealGcsReady =
        res.success === true &&
        res.gcsEnabled === true &&
        res.provider === "gcs" &&
        res.fallbackMode === false &&
        res.bucketsCheck.assetBucket === true &&
        res.bucketsCheck.tempBucket === true;

      if (isRealGcsReady) {
        addLog("Config loaded: GCS READY", "success");
        addLog(
          `配置已加载: GCS 已就绪 (项目: ${res.config.projectId}, 资产桶: ${res.config.assetBucket}, 临时桶: ${res.config.tempBucket})`,
          "success"
        );
      } else if (res.provider === "gcs" && (!res.bucketsCheck.assetBucket || !res.bucketsCheck.tempBucket)) {
        addLog(
          `GCS_ACCESS_BLOCKED: 存储提供方为 "gcs" 但存储桶访问权限检测未通过。(资产桶: ${res.bucketsCheck.assetBucket}, 临时桶: ${res.bucketsCheck.tempBucket})`,
          "error"
        );
      } else {
        addLog(
          `配置已加载: 本地降级模式 (${res.bucketsCheck.error || "GCS_ENABLED=false"})`,
          "warn"
        );
      }
    } catch (err: any) {
      const code = err.errorCode || "STORAGE_ERROR";
      setConfigError({ code, message: err.message });
      addLog(`配置检测失败 [${code}]: ${err.message}`, "error");
    } finally {
      setLoadingConfig(false);
    }
  };

  useEffect(() => {
    handleCheckConfig();
  }, []);

  // 2. Upload Test TXT
  const handleUploadTestTxt = async () => {
    setUploadingTxt(true);
    setTxtError(null);
    setTxtResult(null);
    setSignedUrlState(null);
    setSignedUrlError(null);

    const testContent = "Furniture Engineering Agent GCS TEST";
    const blob = new Blob([testContent], { type: "text/plain" });
    const fileName = "gcs-test.txt";
    const projectId = storageConfig?.config?.projectId || "proj_smoke_test";

    addLog("Creating upload session...", "info");
    addLog(`正在为 ${fileName} (${blob.size} 字节) 创建上传会话...`, "info");

    try {
      // Step A: Request upload session using real schema
      const session = await engineeringArtifactApi.createUploadSession({
        projectId,
        skuCode: "SMOKE-TEST",
        kind: "validation_report",
        fileName,
        mimeType: "text/plain",
        sizeBytes: blob.size,
        isTemp: false,
        metadata: {
          smokeTest: true,
          generatedBy: "StorageDiagnosticsPanel",
        },
      });

      addLog("Session created.", "info");
      addLog(`Provider: ${session.storageProvider}`, "info");
      addLog(`上传会话已创建。资产 ID: ${session.artifactId}。目标对象路径: ${session.objectPath}`, "info");

      // Step B: Direct PUT blob to session URL
      addLog("正在通过 PUT 方法上传测试文件内容...", "info");
      const putRes = await fetch(session.sessionUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "text/plain",
        },
        body: blob,
      });

      if (!putRes.ok) {
        const errorText = await putRes.text().catch(() => "");
        const err: any = new Error(`PUT 上传失败 HTTP ${putRes.status}: ${errorText || putRes.statusText}`);
        err.errorCode = "UPLOAD_ERROR";
        throw err;
      }
      addLog("PUT upload acknowledged by storage provider.", "success");

      // Step C: Confirm and complete upload
      addLog(`正在请求 POST /api/engineering/storage/assets/${session.artifactId}/complete 确认完成...`, "info");
      const completeRes = await engineeringArtifactApi.completeUpload(
        session.artifactId,
        blob.size,
        "text/plain"
      );

      const artifact = completeRes.artifact;
      const isLocalSessionUrl = session.sessionUrl.startsWith("/api/engineering/storage/local-upload-session/");
      const uploadStorageProvider: "gcs" | "local_fallback" =
        !isLocalSessionUrl && session.storageProvider === "gcs" && artifact.storage.provider === "gcs"
          ? "gcs"
          : "local_fallback";

      const resData: TestArtifactResult = {
        artifactId: artifact.id,
        bucket: artifact.storage.bucket,
        objectPath: artifact.storage.objectPath,
        sizeBytes: artifact.sizeBytes,
        status: "complete",
        uploadStorageProvider,
      };

      setTxtResult(resData);
      addLog("Artifact completed and verified.", "success");
      addLog(`uploadStorageProvider: ${uploadStorageProvider}`, "success");
      addLog(`测试资产已完成并验证！[${artifact.id}] (存储方: ${uploadStorageProvider})`, "success");
    } catch (err: any) {
      const code = err.errorCode || "UPLOAD_ERROR";
      setTxtError({ code, message: err.message });
      addLog(`文本上传失败 [${code}]: ${err.message}`, "error");
    } finally {
      setUploadingTxt(false);
    }
  };

  // 3. Test Signed URL Read
  const handleTestSignedUrl = async () => {
    if (!txtResult?.artifactId) {
      setSignedUrlError({
        code: "SIGNED_URL_ERROR",
        message: "当前无可用测试资产。请先点击执行“步骤 2: 上传测试文本”。",
      });
      return;
    }

    setTestingSignedUrl(true);
    setSignedUrlError(null);
    setSignedUrlState(null);
    addLog("Requesting signed access URL...", "info");
    addLog(`正在为测试资产 ${txtResult.artifactId} 申请带鉴权的访问 URL...`, "info");

    try {
      const access = await engineeringArtifactApi.getAssetAccess(txtResult.artifactId);

      // Rule 2:
      // 当 access URL 以 /api/engineering/storage/local-access/ 开头时：
      // signedUrlProvider = "local_fallback"
      // 不得计入 REAL CLOUD Signed URL PASS
      const isLocalAccessUrl = access.url.startsWith("/api/engineering/storage/local-access/");
      const signedUrlProvider: "gcs" | "local_fallback" =
        isLocalAccessUrl || access.storageProvider === "local_fallback"
          ? "local_fallback"
          : "gcs";

      // G-INFRA-STORAGE-02: If upload was GCS, returning local fallback is strictly forbidden!
      if (txtResult.uploadStorageProvider === "gcs" && (signedUrlProvider === "local_fallback" || isLocalAccessUrl)) {
        const err: any = new Error("GCS artifact returned local fallback URL! Forbidden by G-INFRA-STORAGE-02: GCS failure cannot fall back to local.");
        err.errorCode = "GCS_SIGNED_URL_ERROR";
        throw err;
      }

      let host = "";
      try {
        const parsed = new URL(access.url, window.location.origin);
        host = parsed.hostname;
      } catch {
        host = access.url;
      }

      const isCloudHost = !isLocalAccessUrl && isGcsSignedUrlHost(access.url);
      const isRealCloudSignedUrl = isCloudHost && signedUrlProvider === "gcs";

      addLog("Signed URL acquired.", "info");
      addLog(`signedUrlProvider: ${signedUrlProvider}`, "info");
      addLog(`Signed URL host: ${host}`, "info");
      setAcquiredSignedUrl(access.url);

      addLog("Fetching file contents...", "info");
      let res: Response;
      try {
        res = await fetch(access.url);
      } catch (fetchErr: any) {
        const isCors = isCloudHost || signedUrlProvider === "gcs";
        const err: any = new Error(
          isCors
            ? "跨域访问限制 (CORS Blocked): 签名 URL 已成功生成，但目标 GCS 存储桶尚未配置前端跨域 (CORS) 允许规则，导致浏览器 fetch 跨域拦截。您可直接在浏览器新标签页中打开链接验证下载。"
            : `Failed to fetch: ${fetchErr.message}`
        );
        err.errorCode = "SIGNED_URL_CORS_BLOCKED";
        err.isCorsIssue = true;
        err.signedUrl = access.url;
        throw err;
      }

      if (!res.ok) {
        const err: any = new Error(`Signed URL read failed HTTP ${res.status}: ${res.statusText}`);
        err.errorCode = "SIGNED_URL_ERROR";
        err.status = res.status;
        err.signedUrl = access.url;
        throw err;
      }

      addLog("HTTP 200", "info");

      const content = await res.text();
      const isMatch = content === "Furniture Engineering Agent GCS TEST";
      const readBack: "PASS" | "FAIL" = isMatch ? "PASS" : "FAIL";

      if (!isMatch) {
        const err: any = new Error(`读取内容不匹配！实际接收: "${content.substring(0, 50)}"`);
        err.errorCode = "COMPLETE_ERROR";
        throw err;
      }

      addLog("Byte parity: PASS", "info");
      addLog("Readback: PASS", "success");

      setSignedUrlState({
        tested: true,
        url: access.url,
        signedUrlProvider,
        isRealCloudSignedUrl,
        readBack,
        content,
      });

      if (isRealCloudSignedUrl) {
        addLog("真实云端签名通过 (REAL CLOUD Signed URL PASS): 确认为 GCS 官方域名 (storage.googleapis.com) 且字节流比对完全匹配。", "success");
      } else {
        addLog(`本地降级代理通过 (LOCAL FALLBACK Signed URL PASS): 已通过本地代理路由验证内容一致。(signedUrlProvider="local_fallback"，未通过云端签名)`, "warn");
      }
    } catch (err: any) {
      const code = err.errorCode || (err.status === 502 ? "GCS_SIGNED_URL_ERROR" : "SIGNED_URL_ERROR");
      const status = err.status || (code === "GCS_SIGNED_URL_ERROR" ? 502 : undefined);
      const provider = err.provider || "gcs";
      const fallbackUsed = err.fallbackUsed ?? false;
      const permissionIssueType = err.permissionIssueType;
      const isCorsIssue = err.isCorsIssue || false;
      const urlToStore = err.signedUrl || acquiredSignedUrl || undefined;

      setSignedUrlError({
        code,
        message: err.message,
        status,
        provider,
        fallbackUsed,
        permissionIssueType,
        isCorsIssue,
        signedUrl: urlToStore,
      });

      if (code === "GCS_SIGNED_URL_ERROR" || status === 502) {
        addLog("GCS_SIGNED_URL_ERROR", "error");
        addLog(`HTTP ${status || 502}`, "error");
        addLog(`provider: ${provider}`, "error");
        addLog(`fallbackUsed: ${fallbackUsed}`, "error");
        if (permissionIssueType) {
          addLog(`permissionIssueType: ${permissionIssueType}`, "error");
        }
        addLog(`Error details: ${err.message}`, "error");
      } else {
        addLog(`签名 URL 读取测试失败 [${code}]: ${err.message}`, "error");
      }
    } finally {
      setTestingSignedUrl(false);
    }
  };

  // 3.1 Probe Signing Diagnostics
  const handleProbeSigning = async () => {
    setProbingSigning(true);
    addLog("[PROBE] 正在调用 GET /api/engineering/storage/debug/signing...", "info");
    try {
      const res = await engineeringArtifactApi.probeSigningDiagnostics();
      addLog(`[PROBE] 运行身份 runtimeIdentity: ${res.runtimeIdentity}`, "info");
      addLog(`[PROBE] 存储桶访问 canAccessBucket: ${res.canAccessBucket}`, res.canAccessBucket ? "success" : "warn");
      addLog(`[PROBE] 签名权限 canSignBlob: ${res.canSignBlob}`, res.canSignBlob ? "success" : "error");
      if (!res.canSignBlob || !res.canAccessBucket) {
        addLog(`[PROBE 诊断异常]: ${res.errorMessage || res.errorCode || "Unknown issue"}`, "error");
      } else {
        addLog("[PROBE 诊断通过]: 存储桶读写与 V4 签名权限全部正常！", "success");
      }
    } catch (err: any) {
      addLog(`[PROBE 探针异常]: ${err.message}`, "error");
    } finally {
      setProbingSigning(false);
    }
  };

  // 4. Upload Local File Smoke Test
  const handleUploadLocalFile = async () => {
    if (!localFile) return;

    setUploadingLocalFile(true);
    setLocalFileError(null);
    setLocalFileResult(null);
    setLocalUploadProgress(0);

    const ext = localFile.name.split(".").pop()?.toLowerCase() || "";
    let kind: any = "preview";
    if (["glb", "gltf", "obj", "stl"].includes(ext)) {
      kind = "ai_mesh";
    } else if (["png", "jpg", "jpeg", "webp"].includes(ext)) {
      kind = "reference_image";
    }

    addLog(`开始上传本地冒烟测试文件 ${localFile.name} (${(localFile.size / 1024).toFixed(1)} KB)...`, "info");

    try {
      const result = await engineeringArtifactApi.uploadFileToStorage(
        localFile,
        {
          projectId: storageConfig?.config?.projectId || "proj_smoke_test",
          skuCode: "SMOKE-TEST",
          kind,
          fileName: localFile.name,
          mimeType: localFile.type,
          provider: "smoke_test_manual",
          metadata: {
            smokeTest: true,
            originalName: localFile.name,
            productionTruth: false,
          },
        },
        (pct) => setLocalUploadProgress(pct)
      );

      setLocalFileResult(result);
      addLog(`本地文件冒烟资产已上传并验证: ${result.artifact.id}`, "success");
    } catch (err: any) {
      const code = err.errorCode || "UPLOAD_ERROR";
      setLocalFileError({ code, message: err.message });
      addLog(`本地文件上传失败 [${code}]: ${err.message}`, "error");
    } finally {
      setUploadingLocalFile(false);
    }
  };

  // PASS indicators & status evaluations
  const isContractError =
    Boolean(contractError) ||
    (!!storageConfig &&
      (storageConfig.bucketsCheck === undefined ||
        typeof storageConfig.bucketsCheck.assetBucket !== "boolean" ||
        typeof storageConfig.bucketsCheck.tempBucket !== "boolean" ||
        typeof storageConfig.fallbackMode !== "boolean" ||
        !storageConfig.provider));

  const isGcsProvider = storageConfig?.provider === "gcs";
  const assetBucketOk = storageConfig?.bucketsCheck?.assetBucket === true;
  const tempBucketOk = storageConfig?.bucketsCheck?.tempBucket === true;
  const bucketsOk = assetBucketOk && tempBucketOk;

  // Gate Condition: REAL_GCS_READY
  const REAL_GCS_READY =
    !isContractError &&
    storageConfig !== null &&
    storageConfig.success === true &&
    storageConfig.gcsEnabled === true &&
    storageConfig.provider === "gcs" &&
    storageConfig.fallbackMode === false &&
    assetBucketOk &&
    tempBucketOk;

  // Rule 1:
  // 当 provider === "gcs" 但 assetBucket === false 或 tempBucket === false:
  // 状态必须: GCS_ACCESS_BLOCKED
  // 不得显示: GCS Active
  const isGcsBlocked =
    !isContractError &&
    !REAL_GCS_READY &&
    isGcsProvider &&
    (!assetBucketOk || !tempBucketOk);

  const isGcsActive = REAL_GCS_READY;

  // Rule 2 & 3:
  // REAL CLOUD PASS 必须同时满足：
  // provider === "gcs"
  // fallbackMode === false
  // assetBucket === true
  // tempBucket === true
  // uploadStorageProvider === "gcs"
  // accessUrl hostname === storage.googleapis.com 或合法 GCS signed URL host
  // readBack === PASS
  const isRealCloudPass =
    REAL_GCS_READY &&
    txtResult?.uploadStorageProvider === "gcs" &&
    isGcsSignedUrlHost(signedUrlState?.url || "") &&
    signedUrlState?.signedUrlProvider === "gcs" &&
    signedUrlState?.isRealCloudSignedUrl === true &&
    signedUrlState?.readBack === "PASS";

  const isLocalFallbackPass =
    !isRealCloudPass &&
    !isGcsBlocked &&
    !isContractError &&
    !!storageConfig &&
    !!txtResult &&
    txtResult.status === "complete" &&
    signedUrlState?.readBack === "PASS";

  const isConfigPass = !isContractError && !!storageConfig && (isGcsProvider ? bucketsOk : true);
  const isTxtUploadPass = !!txtResult;
  const isArtifactCompletePass = txtResult?.status === "complete";
  const isSignedUrlReadPass = signedUrlState?.readBack === "PASS";

  return (
    <div id="storage-diagnostics-panel" className="w-full h-full flex flex-col bg-[#121215] text-[#e0e0e6] p-6 overflow-y-auto">
      {/* Header & Gate Status */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#272730]">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#8e8e9c] uppercase font-mono tracking-wider">
            <span>技能扩展 (Skills)</span>
            <span>/</span>
            <span>开发者工具 (Developer)</span>
            <span>/</span>
            <span className="text-[#4fc3f7] font-semibold">云存储诊断 (Storage Diagnostics)</span>
          </div>
          <h2 className="text-xl font-bold text-white mt-1 flex items-center gap-2">
            <Cloud className="w-5 h-5 text-[#4fc3f7]" />
            GCS 工程云存储诊断与冒烟测试 (Storage Diagnostics & Smoke Test)
          </h2>
        </div>

        {/* 4-Gate PASS Indicator */}
        <div className="flex items-center gap-3">
          {isRealCloudPass ? (
            <div
              id="storage-gate-pass-badge"
              className="px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 border shadow-lg bg-[#0d3b24] text-[#4ade80] border-[#22c55e]"
            >
              <CheckCircle2 className="w-5 h-5" />
              <span>G-INFRA-STORAGE-01 = 真实云存储通过 (REAL CLOUD PASS)</span>
            </div>
          ) : isLocalFallbackPass ? (
            <div
              id="storage-gate-pass-badge"
              className="px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 border shadow-lg bg-[#272511] text-[#fbbf24] border-[#f59e0b]"
            >
              <CheckCircle2 className="w-5 h-5" />
              <span>G-INFRA-STORAGE-01 = 本地降级通过 (LOCAL FALLBACK PASS)</span>
            </div>
          ) : isContractError ? (
            <div
              id="storage-gate-pass-badge"
              className="px-4 py-2 rounded-lg font-mono text-xs bg-[#2a1a10] border border-[#f97316] text-[#fb923c] flex items-center gap-2"
            >
              <AlertTriangle className="w-4 h-4 text-[#f97316]" />
              <span>状态: 契约异常 CONTRACT_ERROR (缺少必要响应字段)</span>
            </div>
          ) : isGcsBlocked ? (
            <div
              id="storage-gate-pass-badge"
              className="px-4 py-2 rounded-lg font-mono text-xs bg-[#2a1010] border border-[#ef4444] text-[#f87171] flex items-center gap-2"
            >
              <AlertTriangle className="w-4 h-4 text-[#ef4444]" />
              <span>状态: 访问受阻 GCS_ACCESS_BLOCKED (存储桶访问受限)</span>
            </div>
          ) : REAL_GCS_READY ? (
            <div
              id="storage-gate-pass-badge"
              className="px-4 py-2 rounded-lg font-bold text-xs bg-[#14532d] border border-[#22c55e] text-[#4ade80] flex items-center gap-2"
            >
              <Check className="w-4 h-4 text-[#4ade80]" />
              <span>状态: GCS 已就绪 (GCS READY)</span>
            </div>
          ) : (
            <div className="px-4 py-2 rounded-lg font-mono text-xs bg-[#1f1f28] border border-[#383848] text-[#a0a0b2] flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-[#8e8e9c]" />
              <span>冒烟测试进度: {[isConfigPass, isTxtUploadPass, isArtifactCompletePass, isSignedUrlReadPass].filter(Boolean).length} / 4 项通过</span>
            </div>
          )}
        </div>
      </div>

      {/* Grid: Config Cards & Four Gate Checkmarks */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mt-6">
        {/* Metric 1: GCS Status */}
        <div className="bg-[#181820] border border-[#2c2c38] rounded-lg p-4">
          <div className="text-xs text-[#8e8e9c] font-medium">GCS 存储提供方 (Storage Provider)</div>
          <div className="flex items-center gap-2 mt-2">
            {isContractError ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-[#451a03] text-[#fb923c] border border-[#f97316]">
                <AlertTriangle className="w-3.5 h-3.5 text-[#f97316]" /> 契约异常 CONTRACT_ERROR
              </span>
            ) : isGcsBlocked ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-[#450a0a] text-[#f87171] border border-[#ef4444]">
                <AlertTriangle className="w-3.5 h-3.5 text-[#ef4444]" /> 访问受阻 GCS_ACCESS_BLOCKED
              </span>
            ) : REAL_GCS_READY ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-[#14532d] text-[#4ade80] border border-[#22c55e]">
                <Check className="w-3.5 h-3.5" /> GCS 已就绪 (READY)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-[#3f2a14] text-[#f59e0b] border border-[#d97706]">
                <HardDrive className="w-3.5 h-3.5" /> 本地降级模式 (Local Fallback)
              </span>
            )}
          </div>
          <div className="text-xs text-[#71717a] mt-2">
            上传模式: <span className="text-white font-mono">{storageConfig?.config?.uploadMode === "resumable" ? "分块断点续传 (resumable)" : storageConfig?.config?.uploadMode || "自动 (auto)"}</span>
          </div>
        </div>

        {/* Metric 2: Project & Buckets */}
        <div className="bg-[#181820] border border-[#2c2c38] rounded-lg p-4">
          <div className="text-xs text-[#8e8e9c] font-medium">GCP 项目与存储桶 (Project & Buckets)</div>
          <div className="text-sm font-semibold text-white mt-1 truncate" title={storageConfig?.config?.projectId}>
            {storageConfig?.config?.projectId || "正在加载..."}
          </div>
          <div className="text-xs text-[#a1a1aa] mt-1 truncate" title={storageConfig?.config?.assetBucket}>
            资产桶 (Asset): <span className="font-mono text-xs">{storageConfig?.config?.assetBucket || "-"}</span>
          </div>
          <div className="text-xs text-[#a1a1aa] truncate" title={storageConfig?.config?.tempBucket}>
            临时桶 (Temp): <span className="font-mono text-xs">{storageConfig?.config?.tempBucket || "-"}</span>
          </div>
        </div>

        {/* Metric 3: Signed URL TTL & Security */}
        <div className="bg-[#181820] border border-[#2c2c38] rounded-lg p-4">
          <div className="text-xs text-[#8e8e9c] font-medium">签名 URL 与安全凭据 (Signed URL & Security)</div>
          <div className="text-sm font-semibold text-white mt-1 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-[#4fc3f7]" />
            有效期 TTL: {storageConfig?.config?.signedUrlTtlSeconds || 1800}秒 (v4 HMAC 签名)
          </div>
          <div className="text-xs text-[#71717a] mt-2">
            客户端无明文密钥文件。已挂载运行身份:
          </div>
          <div className="text-xs text-[#4ade80] truncate font-mono mt-0.5" title={storageConfig?.backendServiceIdentity}>
            {storageConfig?.backendServiceIdentity || "正在获取运行身份..."}
          </div>
        </div>

        {/* Metric 4: 4-Gate Checklist Summary */}
        <div className="bg-[#181820] border border-[#2c2c38] rounded-lg p-4 flex flex-col justify-between">
          <div className="text-xs text-[#8e8e9c] font-medium">门禁验证清单 (Gate Checklist)</div>
          <div className="grid grid-cols-2 gap-2 mt-2 text-xs font-mono">
            <div className={`flex items-center gap-1.5 ${isContractError ? "text-[#f97316]" : isGcsBlocked ? "text-[#ef4444]" : isConfigPass ? "text-[#4ade80]" : "text-[#71717a]"}`}>
              {isContractError ? (
                <AlertTriangle className="w-3.5 h-3.5 text-[#f97316]" />
              ) : isGcsBlocked ? (
                <AlertTriangle className="w-3.5 h-3.5 text-[#ef4444]" />
              ) : isConfigPass ? (
                <CheckCircle2 className="w-3.5 h-3.5" />
              ) : (
                <div className="w-3.5 h-3.5 rounded-full border border-gray-600" />
              )}
              <span>1. {isContractError ? "契约异常" : isGcsBlocked ? "GCS受阻" : "配置正常"}</span>
            </div>
            <div className={`flex items-center gap-1.5 ${isTxtUploadPass ? "text-[#4ade80]" : "text-[#71717a]"}`}>
              {isTxtUploadPass ? <CheckCircle2 className="w-3.5 h-3.5" /> : <div className="w-3.5 h-3.5 rounded-full border border-gray-600" />}
              <span>2. 文本上传 {txtResult ? `(${txtResult.uploadStorageProvider === "gcs" ? "GCS" : "本地"})` : ""}</span>
            </div>
            <div className={`flex items-center gap-1.5 ${isArtifactCompletePass ? "text-[#4ade80]" : "text-[#71717a]"}`}>
              {isArtifactCompletePass ? <CheckCircle2 className="w-3.5 h-3.5" /> : <div className="w-3.5 h-3.5 rounded-full border border-gray-600" />}
              <span>3. 注册完成</span>
            </div>
            <div className={`flex items-center gap-1.5 ${isSignedUrlReadPass ? "text-[#4ade80]" : "text-[#71717a]"}`}>
              {isSignedUrlReadPass ? <CheckCircle2 className="w-3.5 h-3.5" /> : <div className="w-3.5 h-3.5 rounded-full border border-gray-600" />}
              <span>4. {isRealCloudPass ? "云端读取" : signedUrlState?.readBack === "PASS" ? "本地读取" : "读取校验"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Smoke Test Workstation */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        {/* Left Column: Test Actions */}
        <div className="flex flex-col gap-6">
          {/* Action 1: Check Storage Config */}
          <div className="bg-[#181820] border border-[#2c2c38] rounded-lg p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-[#2a2a38] text-xs flex items-center justify-center font-mono">1</span>
                检测云存储配置 (Check Storage Config)
              </h3>
              <button
                id="btn-check-storage-config"
                onClick={handleCheckConfig}
                disabled={loadingConfig}
                className="px-3 py-1.5 bg-[#2c2c3a] hover:bg-[#39394c] text-white text-xs font-medium rounded flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingConfig ? "animate-spin" : ""}`} />
                {loadingConfig ? "检测中..." : "检测云存储配置"}
              </button>
            </div>

            {configError && (
              <div className="mt-3 p-3 rounded bg-[#3b1212] border border-[#ef4444] text-xs text-[#fca5a5] flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-[#ef4444]" />
                <div>
                  <div className="font-bold">[{configError.code}]</div>
                  <div>{configError.message}</div>
                </div>
              </div>
            )}

            {isContractError && (
              <div className="mt-3 p-3 rounded bg-[#3b2012] border border-[#f97316] text-xs text-[#fdba74] flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-[#f97316]" />
                <div>
                  <div className="font-bold">[契约异常 CONTRACT_ERROR]</div>
                  <div>{contractError || "API 响应结构缺少必要字段 (bucketsCheck, provider, fallbackMode)。"}</div>
                </div>
              </div>
            )}

            {storageConfig && !isContractError && (
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-mono bg-[#111116] p-3 rounded border border-[#252530]">
                <div>存储提供方: <span className="text-[#4fc3f7]">{storageConfig.provider}</span></div>
                <div>降级模式: <span className={storageConfig.fallbackMode ? "text-[#f59e0b]" : "text-[#4ade80]"}>{storageConfig.fallbackMode ? "已启用 (true)" : "已关闭 (false)"}</span></div>
                <div className="flex items-center gap-1">
                  资产桶 (Asset):
                  {storageConfig.bucketsCheck.assetBucket ? (
                    <span className="text-[#4ade80] flex items-center gap-0.5"><Check className="w-3 h-3" /> 可访问 (Reachable)</span>
                  ) : (
                    <span className="text-[#ef4444] flex items-center gap-0.5"><XCircle className="w-3 h-3" /> 不可达 (Unreachable)</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  临时桶 (Temp):
                  {storageConfig.bucketsCheck.tempBucket ? (
                    <span className="text-[#4ade80] flex items-center gap-0.5"><Check className="w-3 h-3" /> 可访问 (Reachable)</span>
                  ) : (
                    <span className="text-[#ef4444] flex items-center gap-0.5"><XCircle className="w-3 h-3" /> 不可达 (Unreachable)</span>
                  )}
                </div>
                {REAL_GCS_READY && (
                  <div className="col-span-2 text-[#4ade80] font-bold mt-1 flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-[#4ade80]" />
                    状态: GCS 已就绪 (资产桶与临时桶均已验证在 GCP 上可达)
                  </div>
                )}
                {isGcsBlocked && (
                  <div className="col-span-2 text-[#ef4444] font-bold mt-1 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-[#ef4444]" />
                    状态: 访问受阻 GCS_ACCESS_BLOCKED (提供方为 "gcs" 但存储桶访问权限失败，GCS Active 标志已禁用)
                  </div>
                )}
                {storageConfig.bucketsCheck.error && !isGcsBlocked && (
                  <div className="col-span-2 text-[#f59e0b] mt-1">
                    提示: {storageConfig.bucketsCheck.error}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Action 2: Upload Test TXT */}
          <div className="bg-[#181820] border border-[#2c2c38] rounded-lg p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#2a2a38] text-xs flex items-center justify-center font-mono">2</span>
                  上传测试文本 (Upload Test TXT)
                </h3>
                <p className="text-xs text-[#8e8e9c] mt-0.5">
                  在浏览器端生成 “Furniture Engineering Agent GCS TEST” 样本并执行两阶段上传会话。
                </p>
              </div>
              <button
                id="btn-upload-test-txt"
                onClick={handleUploadTestTxt}
                disabled={uploadingTxt}
                className="px-3.5 py-1.5 bg-[#4fc3f7] hover:bg-[#38bdf8] text-black text-xs font-bold rounded flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <Upload className={`w-3.5 h-3.5 ${uploadingTxt ? "animate-bounce" : ""}`} />
                {uploadingTxt ? "正在上传..." : "上传测试文本"}
              </button>
            </div>

            {txtError && (
              <div className="mt-3 p-3 rounded bg-[#3b1212] border border-[#ef4444] text-xs text-[#fca5a5] flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-[#ef4444]" />
                <div>
                  <div className="font-bold">[{txtError.code}]</div>
                  <div>{txtError.message}</div>
                </div>
              </div>
            )}

            {txtResult && (
              <div className="mt-3 bg-[#111116] p-3 rounded border border-[#252530] text-xs font-mono space-y-1">
                <div className="text-[#4ade80] font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  文本上传并完成注册确认
                </div>
                <div className="text-[#a0a0b2] pt-1">
                  资产 ID (artifactId): <span className="text-white">{txtResult.artifactId}</span>
                </div>
                <div className="text-[#a0a0b2]">
                  存储桶 (bucket): <span className="text-white">{txtResult.bucket}</span>
                </div>
                <div className="text-[#a0a0b2] truncate" title={txtResult.objectPath}>
                  对象路径 (objectPath): <span className="text-white">{txtResult.objectPath}</span>
                </div>
                <div className="text-[#a0a0b2]">
                  大小: <span className="text-white">{txtResult.sizeBytes} 字节</span> | 状态: <span className="text-[#4ade80] uppercase">{txtResult.status === "complete" ? "已完成 (complete)" : txtResult.status}</span>
                </div>
                <div className="text-[#a0a0b2]">
                  上传存储提供方: <span className={txtResult.uploadStorageProvider === "gcs" ? "text-[#4ade80] font-bold" : "text-[#f59e0b] font-bold"}>{txtResult.uploadStorageProvider === "gcs" ? "GCS 云端存储" : "本地降级代理 (local_fallback)"}</span>
                </div>
              </div>
            )}
          </div>

          {/* Action 3: Test Signed URL */}
          <div className="bg-[#181820] border border-[#2c2c38] rounded-lg p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#2a2a38] text-xs flex items-center justify-center font-mono">3</span>
                  校验签名访问 URL (Test Signed URL)
                </h3>
                <p className="text-xs text-[#8e8e9c] mt-0.5">
                  申请短有效期带鉴权访问链接，并通过网络拉取验证逐字节流完全一致。
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  id="btn-probe-signing"
                  onClick={handleProbeSigning}
                  disabled={probingSigning}
                  className="px-3 py-1.5 bg-[#2a2a38] hover:bg-[#38384d] text-zinc-200 text-xs font-medium rounded flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  title="调用 /api/engineering/storage/debug/signing 探查真实 GCP 身份与权限"
                >
                  <Terminal className="w-3.5 h-3.5 text-zinc-400" />
                  {probingSigning ? "探针检测中..." : "签名权限探针"}
                </button>
                <button
                  id="btn-test-signed-url"
                  onClick={handleTestSignedUrl}
                  disabled={testingSignedUrl || !txtResult}
                  className="px-3.5 py-1.5 bg-[#22c55e] hover:bg-[#16a34a] text-black text-xs font-bold rounded flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FileText className="w-3.5 h-3.5" />
                  {testingSignedUrl ? "正在验证..." : "校验签名 URL"}
                </button>
              </div>
            </div>

            {signedUrlError && (
              <div className="mt-3 p-3.5 rounded bg-[#3b1212] border border-[#ef4444] text-xs text-[#fca5a5] flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0 text-[#ef4444] mt-0.5" />
                <div className="space-y-1.5 flex-1">
                  <div className="font-bold flex items-center gap-2">
                    <span className="text-white">[{signedUrlError.code}]</span>
                    {signedUrlError.status && (
                      <span className="px-1.5 py-0.5 rounded bg-[#ef4444]/20 border border-[#ef4444]/40 text-[11px] font-mono text-white">
                        HTTP {signedUrlError.status}
                      </span>
                    )}
                  </div>
                  {signedUrlError.provider && (
                    <div className="text-[11px] font-mono text-[#fecaca] flex flex-wrap gap-x-4 gap-y-1 bg-[#240808] p-2 rounded border border-[#ef4444]/30">
                      <div>provider: <span className="text-white font-bold">{signedUrlError.provider}</span></div>
                      <div>fallbackUsed: <span className="text-white font-bold">{String(signedUrlError.fallbackUsed ?? false)}</span></div>
                      {signedUrlError.permissionIssueType && (
                        <div className="w-full pt-1 text-[#fca5a5]">
                          权限诊断: <span className="text-[#fde047] font-bold">{signedUrlError.permissionIssueType}</span>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="text-[#fee2e2] break-words pt-0.5">{signedUrlError.message}</div>

                  {signedUrlError.isCorsIssue && signedUrlError.signedUrl && (
                    <div className="mt-2.5 pt-2.5 border-t border-[#ef4444]/30 space-y-2">
                      <div className="text-zinc-200">
                        💡 <strong>验证建议</strong>：URL 签名在云端已成功生成！您可直接在新标签页打开（新标签页不经过 JS fetch，无跨域限制）：
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => window.open(signedUrlError.signedUrl, "_blank")}
                          className="px-2.5 py-1 bg-[#38bdf8] hover:bg-[#0ea5e9] text-black text-[11px] font-bold rounded flex items-center gap-1 transition-colors"
                        >
                          <ExternalLink className="w-3 h-3" />
                          在新标签页打开下载验证
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (signedUrlError.signedUrl) {
                              navigator.clipboard.writeText(signedUrlError.signedUrl);
                              addLog("已复制带签名 URL 到剪贴板", "info");
                            }
                          }}
                          className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] rounded border border-zinc-700 flex items-center gap-1 transition-colors"
                        >
                          <Copy className="w-3 h-3" />
                          复制签名链接
                        </button>
                      </div>
                      <div className="text-[11px] text-zinc-400 font-mono bg-[#1a0c0c] p-2 rounded border border-[#ef4444]/20 leading-relaxed">
                        若需支持前端 fetch 直连读取，在 Cloud Shell 中为存储桶配置 CORS：<br />
                        <span className="text-[#4ade80]">
                          gcloud storage buckets update gs://fes-assets-0557963301 --cors-file=cors.json
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {signedUrlState && signedUrlState.readBack === "PASS" && (
              <div
                className={`mt-3 p-3 rounded text-xs border ${
                  signedUrlState.isRealCloudSignedUrl
                    ? "bg-[#0d3b24] border-[#22c55e]"
                    : "bg-[#2b1e0f] border-[#f59e0b]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`font-bold flex items-center gap-1.5 text-sm ${
                      signedUrlState.isRealCloudSignedUrl ? "text-[#4ade80]" : "text-[#fbbf24]"
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {signedUrlState.isRealCloudSignedUrl
                      ? "真实云端签名通过 (REAL CLOUD Signed URL PASS)"
                      : "本地降级代理通过 (LOCAL FALLBACK Signed URL PASS)"}
                  </span>
                  <span className="text-xs font-mono text-[#a1a1aa]">
                    签名提供方:{" "}
                    <span className="text-white font-bold">{signedUrlState.signedUrlProvider}</span>
                  </span>
                </div>
                <div className="mt-1 text-xs text-[#dcfce7] font-mono bg-[#062415] p-2 rounded border border-[#166534]">
                  "{signedUrlState.content}"
                </div>
                {signedUrlState.signedUrlProvider === "local_fallback" && (
                  <div className="mt-2 text-xs text-[#f59e0b]">
                    提示: 访问 URL 以 <span className="font-mono">/api/engineering/storage/local-access/</span> 开头。
                    签名提供方被标记为 <span className="font-mono font-bold">local_fallback</span>，严格不计入 <span className="font-bold">REAL CLOUD Signed URL PASS</span>。
                  </div>
                )}
                {signedUrlState.isRealCloudSignedUrl && (
                  <div className="mt-2 text-xs text-[#4ade80]">
                    已验证: 经由 Google Cloud Storage 官方存储域名，完成逐字节一致性流式传输校验。
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Action 4: Upload Local File (Smoke Test) */}
          <div className="bg-[#181820] border border-[#2c2c38] rounded-lg p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#2a2a38] text-xs flex items-center justify-center font-mono">4</span>
                  上传本地文件 (冒烟测试)
                </h3>
                <p className="text-xs text-[#8e8e9c] mt-0.5">
                  支持格式: PNG/JPEG, GLB/GLTF, OBJ, STL。仅用于冒烟测试 — <span className="text-[#f59e0b] font-medium">严禁修改 FES 生产真值 (productionTruth=false)</span>。
                </p>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-3">
              <input
                id="file-input-storage-smoke"
                type="file"
                accept=".png,.jpg,.jpeg,.glb,.gltf,.obj,.stl"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setLocalFile(e.target.files[0]);
                    setLocalFileResult(null);
                    setLocalFileError(null);
                  }
                }}
                className="text-xs text-[#8e8e9c] file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-[#2c2c3a] file:text-white hover:file:bg-[#39394c] cursor-pointer"
              />
              <button
                id="btn-upload-local-file-smoke"
                onClick={handleUploadLocalFile}
                disabled={!localFile || uploadingLocalFile}
                className="px-3 py-1.5 bg-[#4fc3f7] hover:bg-[#38bdf8] text-black text-xs font-bold rounded flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <Upload className="w-3.5 h-3.5" />
                {uploadingLocalFile ? `正在上传 ${localUploadProgress}%` : "上传冒烟资产"}
              </button>
            </div>

            {localFileError && (
              <div className="mt-3 p-3 rounded bg-[#3b1212] border border-[#ef4444] text-xs text-[#fca5a5] flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-[#ef4444]" />
                <div>
                  <div className="font-bold">[{localFileError.code}]</div>
                  <div>{localFileError.message}</div>
                </div>
              </div>
            )}

            {localFileResult && (
              <div className="mt-3 bg-[#111116] p-3 rounded border border-[#252530] text-xs font-mono space-y-1">
                <div className="text-[#4ade80] font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  冒烟测试资产已存储并验证
                </div>
                <div className="text-[#a0a0b2]">
                  资产 ID: <span className="text-white">{localFileResult.artifact.id}</span>
                </div>
                <div className="text-[#a0a0b2]">
                  类别: <span className="text-[#4fc3f7]">{localFileResult.artifact.kind}</span> | 生产真值: <span className="text-[#f59e0b]">false (非生产真值)</span>
                </div>
                <div className="text-[#a0a0b2] truncate">
                  存储路径: <span className="text-white">{localFileResult.artifact.storage.objectPath}</span>
                </div>
                <div className="pt-1">
                  <a
                    href={localFileResult.accessUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#4fc3f7] hover:underline flex items-center gap-1 inline-flex text-xs"
                  >
                    在外部打开已签名资产流 <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Real-Time Operational Activity Logs */}
        <div className="flex flex-col bg-[#181820] border border-[#2c2c38] rounded-lg p-5">
          <div className="flex items-center justify-between pb-3 border-b border-[#282834]">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Terminal className="w-4 h-4 text-[#4fc3f7]" />
              存储操作控制台与执行日志 (Execution Console & Audit Log)
            </h3>
            <button
              onClick={() => setLogs([])}
              className="text-xs text-[#8e8e9c] hover:text-white transition-colors"
            >
              清空日志
            </button>
          </div>

          <div
            id="storage-diag-logs"
            className="flex-1 mt-3 bg-[#0d0d12] border border-[#23232e] rounded-lg p-3 font-mono text-xs overflow-y-auto space-y-1.5 min-h-[360px] max-h-[560px]"
          >
            {logs.length === 0 ? (
              <div className="text-[#52525b] text-center pt-24">
                暂无存储操作记录。点击左侧测试操作即可开始。
              </div>
            ) : (
              logs.map((item, idx) => (
                <div key={idx} className="flex items-start gap-2 leading-relaxed">
                  <span className="text-[#52525b] shrink-0">[{item.time}]</span>
                  <span
                    className={
                      item.type === "success"
                        ? "text-[#4ade80]"
                        : item.type === "error"
                        ? "text-[#ef4444]"
                        : item.type === "warn"
                        ? "text-[#f59e0b]"
                        : "text-[#a1a1aa]"
                    }
                  >
                    {item.text}
                  </span>
                </div>
              ))
            )}
          </div>

          {/* Security & Governance Notice */}
          <div className="mt-4 p-3 bg-[#13131a] rounded border border-[#252532] text-xs text-[#8e8e9c] flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-[#4fc3f7] shrink-0 mt-0.5" />
            <div>
              <div className="text-white font-medium">云安全与规范治理 (Security & Cloud Governance)</div>
              <div className="mt-0.5">
                所有云端存储认证均由 Cloud Run 绑定的服务账号 (IAM Role) 自动化托管处理。
                浏览器客户端严格禁止存储或解析私钥与 JSON 证书文件。
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
