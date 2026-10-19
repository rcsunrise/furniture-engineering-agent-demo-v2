import React, { useState, useEffect } from "react";
import { Settings, CheckCircle2, AlertCircle, Eye, EyeOff, Loader2, Sparkles, Server, Key, Brain, Eye as VisionIcon, Image as ImageIcon } from "lucide-react";

export interface AiSettingsConfig {
  provider: "routerhub" | "vectorengine" | "gemini";
  baseUrl: string;
  apiKey: string;
  reasonModel: string;
  visionModel: string;
  imageModel: string;
  apiKeyMasked?: string;
  hasKey?: boolean;
}

interface AiSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigSaved?: (cfg: AiSettingsConfig) => void;
}

const PRESET_TIANTOKEN: Partial<AiSettingsConfig> = {
  provider: "routerhub",
  baseUrl: "https://api.tiantoken.com",
  reasonModel: "gpt-6.1-sol",
  visionModel: "gemini-3.8-flash",
  imageModel: "gemini-nano-banana-2.1",
};

const PRESET_GEMINI_OFFICIAL: Partial<AiSettingsConfig> = {
  provider: "gemini",
  baseUrl: "https://generativelanguage.googleapis.com",
  reasonModel: "gemini-2.5-flash",
  visionModel: "gemini-2.5-flash",
  imageModel: "imagen-3.0-generate-002",
};

export const AiSettingsModal: React.FC<AiSettingsModalProps> = ({ isOpen, onClose, onConfigSaved }) => {
  const [provider, setProvider] = useState<"routerhub" | "vectorengine" | "gemini">("routerhub");
  const [baseUrl, setBaseUrl] = useState("https://api.tiantoken.com");
  const [apiKey, setApiKey] = useState("");
  const [apiKeyMasked, setApiKeyMasked] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [reasonModel, setReasonModel] = useState("gpt-6.1-sol");
  const [visionModel, setVisionModel] = useState("gemini-3.8-flash");
  const [imageModel, setImageModel] = useState("gemini-nano-banana-2.1");

  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; latencyMs?: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Load existing config on mount / open
  useEffect(() => {
    if (!isOpen) return;

    setTestResult(null);
    setSaveSuccess(false);

    async function fetchCurrentConfig() {
      try {
        const res = await fetch("/api/engineering/config/ai");
        if (res.ok) {
          const data = await res.json();
          if (data?.ok && data.config) {
            const cfg = data.config;
            if (cfg.provider) setProvider(cfg.provider);
            if (cfg.baseUrl) setBaseUrl(cfg.baseUrl);
            if (cfg.reasonModel) setReasonModel(cfg.reasonModel);
            if (cfg.visionModel) setVisionModel(cfg.visionModel);
            if (cfg.imageModel) setImageModel(cfg.imageModel);
            if (cfg.apiKeyMasked) setApiKeyMasked(cfg.apiKeyMasked);
            setHasKey(Boolean(cfg.hasKey));
          }
        }
      } catch (err) {
        console.warn("Failed to fetch active AI config:", err);
      }
    }

    fetchCurrentConfig();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleApplyPreset = (preset: Partial<AiSettingsConfig>) => {
    if (preset.provider) setProvider(preset.provider);
    if (preset.baseUrl) setBaseUrl(preset.baseUrl);
    if (preset.reasonModel) setReasonModel(preset.reasonModel);
    if (preset.visionModel) setVisionModel(preset.visionModel);
    if (preset.imageModel) setImageModel(preset.imageModel);
    setTestResult(null);
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/engineering/config/ai/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          baseUrl,
          apiKey: apiKey || undefined, // if empty, backend uses already configured key
          reasonModel,
        }),
      });

      const data = await res.json();
      setTestResult(data);
    } catch (err: any) {
      setTestResult({
        ok: false,
        message: `网络连接异常: ${err.message || String(err)}`,
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSaveConfig = async () => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      const res = await fetch("/api/engineering/config/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          baseUrl,
          apiKey: apiKey.trim() || undefined,
          reasonModel,
          visionModel,
          imageModel,
        }),
      });

      const data = await res.json();
      if (data?.ok) {
        setSaveSuccess(true);
        if (data.config?.apiKeyMasked) {
          setApiKeyMasked(data.config.apiKeyMasked);
          setHasKey(true);
          setApiKey(""); // clear plain input once saved
        }
        if (onConfigSaved && data.config) {
          onConfigSaved(data.config);
        }
        setTimeout(() => {
          setSaveSuccess(false);
        }, 3000);
      } else {
        alert(`保存配置失败: ${data?.error || "未知错误"}`);
      }
    } catch (err: any) {
      alert(`保存失败: ${err.message || String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: 20,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 620,
          background: "#1c1c24",
          border: "1px solid #3d3d52",
          borderRadius: 12,
          boxShadow: "0 20px 50px rgba(0, 0, 0, 0.6)",
          color: "#fff",
          display: "flex",
          flexDirection: "column",
          maxHeight: "90vh",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid #2d2d3a",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#181820",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "linear-gradient(135deg, #0288d1, #4fc3f7)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#000",
              }}
            >
              <Settings size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>AI 模型与 API 密钥设置</h3>
              <p style={{ margin: 0, fontSize: 12, color: "#8e8ea0" }}>
                配置用于驱动智能规划、G3视觉理解及绘图的外部 API 网关
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#aaa",
              fontSize: 20,
              cursor: "pointer",
              padding: "4px 8px",
              borderRadius: 4,
            }}
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: "18px 20px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Quick Presets */}
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#aaa", marginBottom: 6 }}>
              快捷预设配置 (One-Click Presets)
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => handleApplyPreset(PRESET_TIANTOKEN)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 12px",
                  fontSize: 12,
                  background: baseUrl.includes("tiantoken") ? "#0288d122" : "#262633",
                  color: baseUrl.includes("tiantoken") ? "#4fc3f7" : "#ddd",
                  border: baseUrl.includes("tiantoken") ? "1px solid #4fc3f7" : "1px solid #3a3a4e",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                <Sparkles size={14} /> 词元流墟 (Tiantoken 推荐)
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset(PRESET_GEMINI_OFFICIAL)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 12px",
                  fontSize: 12,
                  background: baseUrl.includes("googleapis") ? "#0288d122" : "#262633",
                  color: baseUrl.includes("googleapis") ? "#4fc3f7" : "#ddd",
                  border: baseUrl.includes("googleapis") ? "1px solid #4fc3f7" : "1px solid #3a3a4e",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                <Server size={14} /> Google AI Studio (官方直连)
              </button>
            </div>
          </div>

          {/* API Base URL */}
          <div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 500, color: "#ccc", marginBottom: 6 }}>
              <Server size={15} color="#4fc3f7" /> API 接口网关地址 (Base URL)
            </label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.tiantoken.com"
              style={{
                width: "100%",
                padding: "9px 12px",
                background: "#13131a",
                border: "1px solid #3a3a4c",
                borderRadius: 6,
                color: "#fff",
                fontSize: 13,
                outline: "none",
                fontFamily: "monospace",
              }}
            />
            <span style={{ fontSize: 11, color: "#777", marginTop: 3, display: "block" }}>
              兼容标准 OpenAI 协议（自动附加 <code>/v1/chat/completions</code>）
            </span>
          </div>

          {/* API Key */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 500, color: "#ccc" }}>
                <Key size={15} color="#4fc3f7" /> API 密钥 (API Key / Token)
              </label>
              {hasKey && (
                <span style={{ fontSize: 11, color: "#81c784", display: "flex", alignItems: "center", gap: 4 }}>
                  <CheckCircle2 size={12} /> 当前已配置: <code>{apiKeyMasked}</code>
                </span>
              )}
            </div>
            <div style={{ position: "relative" }}>
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={hasKey ? "留空则保持当前已配置的密钥不变" : "请输入 sk- 开头的 API 密钥"}
                style={{
                  width: "100%",
                  padding: "9px 36px 9px 12px",
                  background: "#13131a",
                  border: "1px solid #3a3a4c",
                  borderRadius: 6,
                  color: "#fff",
                  fontSize: 13,
                  outline: "none",
                  fontFamily: "monospace",
                }}
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                style={{
                  position: "absolute",
                  right: 8,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "transparent",
                  border: "none",
                  color: "#777",
                  cursor: "pointer",
                  padding: 4,
                }}
              >
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Models Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {/* Reasoning Model */}
            <div>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 500, color: "#ccc", marginBottom: 6 }}>
                <Brain size={14} color="#81c784" /> 规划推理模型 (Agent / Reason)
              </label>
              <input
                type="text"
                list="reason-models-list"
                value={reasonModel}
                onChange={(e) => setReasonModel(e.target.value)}
                placeholder="gpt-6.1-sol"
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  background: "#13131a",
                  border: "1px solid #3a3a4c",
                  borderRadius: 6,
                  color: "#fff",
                  fontSize: 12,
                  fontFamily: "monospace",
                }}
              />
              <datalist id="reason-models-list">
                <option value="gpt-6.1-sol">gpt-6.1-sol (推荐推理)</option>
                <option value="gemini-3.8-flash">gemini-3.8-flash (极速通用)</option>
                <option value="gemini-3.6-flash">gemini-3.6-flash</option>
                <option value="gemini-2.5-pro">gemini-2.5-pro</option>
                <option value="deepseek-chat">deepseek-chat</option>
                <option value="claude-3-5-sonnet">claude-3-5-sonnet</option>
              </datalist>
            </div>

            {/* Vision Model */}
            <div>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 500, color: "#ccc", marginBottom: 6 }}>
                <VisionIcon size={14} color="#ffb74d" /> 多模态视觉模型 (Vision)
              </label>
              <input
                type="text"
                list="vision-models-list"
                value={visionModel}
                onChange={(e) => setVisionModel(e.target.value)}
                placeholder="gemini-3.8-flash"
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  background: "#13131a",
                  border: "1px solid #3a3a4c",
                  borderRadius: 6,
                  color: "#fff",
                  fontSize: 12,
                  fontFamily: "monospace",
                }}
              />
              <datalist id="vision-models-list">
                <option value="gemini-3.8-flash">gemini-3.8-flash (推荐视觉)</option>
                <option value="gemini-3.6-flash">gemini-3.6-flash</option>
                <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                <option value="gemini-2.5-pro">gemini-2.5-pro</option>
                <option value="qwen3-vl-plus">qwen3-vl-plus</option>
              </datalist>
            </div>
          </div>

          {/* Image Gen Model */}
          <div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 500, color: "#ccc", marginBottom: 6 }}>
              <ImageIcon size={14} color="#ba68c8" /> 2D 概念图生成模型 (Image Gen)
            </label>
            <input
              type="text"
              list="image-models-list"
              value={imageModel}
              onChange={(e) => setImageModel(e.target.value)}
              placeholder="gemini-nano-banana-2.1"
              style={{
                width: "100%",
                padding: "8px 10px",
                background: "#13131a",
                border: "1px solid #3a3a4c",
                borderRadius: 6,
                color: "#fff",
                fontSize: 12,
                fontFamily: "monospace",
              }}
            />
            <datalist id="image-models-list">
              <option value="gemini-nano-banana-2.1">gemini-nano-banana-2.1 (词元流墟绘图)</option>
              <option value="flux-2-pro">flux-2-pro</option>
              <option value="sd-2.5">sd-2.5</option>
              <option value="imagen-3.0-generate-002">imagen-3.0-generate-002 (官方)</option>
            </datalist>
          </div>

          {/* Test Status Banner */}
          {testResult && (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 6,
                fontSize: 12,
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                background: testResult.ok ? "#1b5e2022" : "#b71c1c22",
                border: `1px solid ${testResult.ok ? "#2e7d32" : "#c62828"}`,
                color: testResult.ok ? "#81c784" : "#ef9a9a",
              }}
            >
              {testResult.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <div style={{ flex: 1 }}>{testResult.message}</div>
            </div>
          )}

          {saveSuccess && (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 6,
                fontSize: 12,
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "#1b5e2022",
                border: "1px solid #2e7d32",
                color: "#81c784",
              }}
            >
              <CheckCircle2 size={16} />
              <span>配置已成功保存并立即在后台生效！</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: "14px 20px",
            borderTop: "1px solid #2d2d3a",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#181820",
          }}
        >
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testing}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              background: "#2a2a38",
              color: "#fff",
              border: "1px solid #3e3e52",
              borderRadius: 6,
              cursor: testing ? "not-allowed" : "pointer",
              fontSize: 13,
            }}
          >
            {testing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} color="#4fc3f7" />}
            {testing ? "正在探测连通性..." : "测试连接 (Test)"}
          </button>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "8px 16px",
                background: "transparent",
                color: "#aaa",
                border: "1px solid #3a3a4a",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSaveConfig}
              disabled={saving}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 18px",
                background: "#4fc3f7",
                color: "#000",
                fontWeight: 600,
                border: "none",
                borderRadius: 6,
                cursor: saving ? "not-allowed" : "pointer",
                fontSize: 13,
              }}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              {saving ? "保存中..." : "保存并生效"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
