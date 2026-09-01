import { useState, useRef } from "react";
import type { FurnitureEngineeringData, EngineeringValidationReport } from "../../shared/fes.js";
import type { CadDocument } from "../../shared/cad.js";
import type { AssemblyDocument } from "../../shared/assembly.js";
import { parseApiResponse } from "../api.js";

export type ViewMode = "front" | "side" | "top";
export type UploadState = "idle" | "uploading" | "success" | "error";

export function useEngineeringData() {
  const [cadView, setCadView] = useState<ViewMode>("front");
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [fes, setFes] = useState<FurnitureEngineeringData | null>(null);
  const [validationReport, setValidationReport] = useState<EngineeringValidationReport | null>(null);
  const [cad, setCad] = useState<CadDocument | null>(null);
  const [assembly, setAssembly] = useState<AssemblyDocument | null>(null);
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);
  const [status, setStatus] = useState("就绪");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [retryAfterMs, setRetryAfterMs] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const parseInFlightRef = useRef(false);
  const lastFileRef = useRef<File | null>(null);

  function resetAllEngineeringState() {
    setFes(null);
    setValidationReport(null);
    setCad(null);
    setAssembly(null);
    setSelectedComponentId(null);
    setUploadError(null);
    setRetryAfterMs(null);
  }

  async function processFesData(currentFes: FurnitureEngineeringData, report: EngineeringValidationReport) {
    const valLevel = report?.level ? report.level.toUpperCase() : "PASS";

    if (!report || !report.valid || report.level === "fail") {
      setFes(null);
      setValidationReport(null);
      setCad(null);
      setAssembly(null);
      setSelectedComponentId(null);
      setUploadState("error");
      setStatus(`Validation FAIL: ${currentFes.sku}`);
      return;
    }

    setFes(currentFes);
    setValidationReport(report);
    setUploadError(null);

    setStatus("正在构建 CAD-IR 与 3D Assembly Graph...");
    let cadDoc: CadDocument | null = null;
    let assemblyDoc: AssemblyDocument | null = null;

    try {
      const [cadRes, assemblyRes] = await Promise.all([
        fetch(`/api/engineering/cad/${cadView}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(currentFes),
        }),
        fetch("/api/engineering/assembly", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(currentFes),
        }),
      ]);

      const cadParsed = await parseApiResponse<any>(cadRes, `/api/engineering/cad/${cadView}`, "POST");
      const assemblyParsed = await parseApiResponse<any>(assemblyRes, "/api/engineering/assembly", "POST");

      if (cadParsed.ok) cadDoc = cadParsed.data.cad;
      if (assemblyParsed.ok) assemblyDoc = assemblyParsed.data.assembly;
    } catch (netErr: any) {
      console.warn("CAD/Assembly API network error:", netErr);
    }

    if (cadDoc && assemblyDoc) {
      setCad(cadDoc);
      setAssembly(assemblyDoc);
      setUploadState("success");
      setStatus(`解析成功: ${currentFes.sku} | Validation ${valLevel}`);
    } else {
      setUploadState("error");
      setStatus(`CAD/Assembly 构建失败: ${currentFes.sku}`);
    }
  }

  async function handleCadViewChange(newView: ViewMode) {
    setCadView(newView);
    if (!fes) return;

    try {
      const cadRes = await fetch(`/api/engineering/cad/${newView}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fes),
      });
      const parsed = await parseApiResponse<any>(cadRes, `/api/engineering/cad/${newView}`, "POST");
      if (parsed.ok && parsed.data.cad) {
        setCad(parsed.data.cad);
      }
    } catch (e) {
      console.warn("View change fetch error:", e);
    }
  }

  async function upload(file: File, options?: { requestId?: string }) {
    if (parseInFlightRef.current) {
      console.warn("[ExcelParseClient] Duplicate upload trigger blocked (parse in-flight)");
      return;
    }
    parseInFlightRef.current = true;
    lastFileRef.current = file;

    resetAllEngineeringState();
    setUploadState("uploading");
    setStatus(`Parsing workbook (${file.name})...`);

    const requestId =
      options?.requestId ||
      `parse-default-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const fd = new FormData();
      fd.append("file", file);

      const parseRes = await fetch("/api/engineering/excel/parse", {
        method: "POST",
        headers: {
          "X-Parse-Request-Id": requestId,
          "X-Workspace-Id": "default",
        },
        body: fd,
        signal: controller.signal,
      });

      let parsedData: any = null;
      try {
        parsedData = await parseApiResponse<any>(parseRes, "/api/engineering/excel/parse", "POST");
      } catch (err: any) {
        if (err?.name === "AbortError" || controller.signal.aborted) {
          throw new Error("EXCEL_PARSE_TIMEOUT: Excel parse request timed out after 30 seconds.");
        }
        if (err?.httpStatus === 429 || parseRes.status === 429) {
          const retryMs = err?.error?.retryAfterMs || err?.retryAfterMs || 10000;
          setRetryAfterMs(retryMs);
          const msg = `Excel parse request was rate limited. Please retry after ${Math.ceil(retryMs / 1000)} seconds.`;
          setUploadError(msg);
          setUploadState("error");
          setStatus(`解析失败 (429): ${msg}`);
          return;
        }
        if (err?.httpStatus === 409 || parseRes.status === 409) {
          const msg =
            err?.error?.message ||
            err?.message ||
            "An Excel parse job is currently running for this workspace.";
          setUploadError(msg);
          setUploadState("error");
          setStatus(`解析失败 (409): ${msg}`);
          return;
        }
        throw err;
      }

      if (parseRes.status === 429) {
        const retryMs = parsedData?.data?.error?.retryAfterMs || 10000;
        setRetryAfterMs(retryMs);
        const msg = `Excel parse request was rate limited. Please retry after ${Math.ceil(retryMs / 1000)} seconds.`;
        setUploadError(msg);
        setUploadState("error");
        setStatus(`解析失败 (429): ${msg}`);
        return;
      }

      if (parseRes.status === 409) {
        const msg =
          parsedData?.data?.error?.message ||
          "An Excel parse job is currently running for this workspace.";
        setUploadError(msg);
        setUploadState("error");
        setStatus(`解析失败 (409): ${msg}`);
        return;
      }

      if (parsedData.ok && parsedData.data.fes && parsedData.data.engineeringValidation) {
        await processFesData(parsedData.data.fes, parsedData.data.engineeringValidation);
      } else {
        const msg =
          typeof parsedData.data?.error === "object" && parsedData.data?.error?.message
            ? parsedData.data.error.message
            : parsedData.data?.error || "INVALID_WORKBOOK";
        setUploadError(msg);
        setUploadState("error");
        setStatus(`解析失败: ${msg}`);
      }
    } catch (serverErr: any) {
      let msg = serverErr?.message || "网络请求失败";
      if (serverErr?.name === "AbortError") {
        msg = "EXCEL_PARSE_TIMEOUT: Excel parse request timed out after 30 seconds.";
      }
      setUploadError(msg);
      setUploadState("error");
      setStatus(`解析失败: ${msg}`);
    } finally {
      clearTimeout(timeoutId);
      parseInFlightRef.current = false;
    }
  }

  function retryLastUpload() {
    if (lastFileRef.current) {
      upload(lastFileRef.current);
    } else {
      fileInputRef.current?.click();
    }
  }

  async function loadSample(sampleName: string) {
    if (parseInFlightRef.current) return;
    parseInFlightRef.current = true;
    setRetryAfterMs(null);

    resetAllEngineeringState();
    setUploadState("uploading");
    setStatus(`正在加载内置示例 (${sampleName})...`);

    try {
      const res = await fetch(`/api/engineering/excel/sample/${sampleName}`, { method: "POST" });
      const parsed = await parseApiResponse<any>(res, `/api/engineering/excel/sample/${sampleName}`, "POST");

      if (parsed.ok && parsed.data.fes && parsed.data.engineeringValidation) {
        await processFesData(parsed.data.fes, parsed.data.engineeringValidation);
      } else {
        const msg =
          typeof parsed.data?.error === "object" && parsed.data?.error?.message
            ? parsed.data.error.message
            : parsed.data?.error || "示例数据加载失败";
        setUploadError(msg);
        setUploadState("error");
        setStatus(`加载失败: ${msg}`);
      }
    } catch (netErr: any) {
      const msg = `示例加载失败 (${netErr?.message || "网络错误"})`;
      setUploadError(msg);
      setUploadState("error");
      setStatus(msg);
    } finally {
      parseInFlightRef.current = false;
    }
  }

  return {
    cadView,
    setCadView: handleCadViewChange,
    uploadState,
    fes,
    setFes,
    validationReport,
    cad,
    assembly,
    selectedComponentId,
    setSelectedComponentId,
    status,
    setStatus,
    uploadError,
    retryAfterMs,
    retryLastUpload,
    isDragging,
    setIsDragging,
    fileInputRef,
    upload,
    loadSample,
    processFesData,
    parseInFlightRef,
  };
}
