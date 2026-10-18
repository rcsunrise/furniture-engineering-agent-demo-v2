import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import { App } from "./App.js";

function showErrorOverlay(title: string, msg: string) {
  let el = document.getElementById("error-diagnostic-overlay");
  if (!el) {
    el = document.createElement("div");
    el.id = "error-diagnostic-overlay";
    el.style.position = "fixed";
    el.style.top = "16px";
    el.style.left = "16px";
    el.style.right = "16px";
    el.style.zIndex = "999999";
    el.style.padding = "20px";
    el.style.backgroundColor = "#7f1d1d";
    el.style.color = "#fef2f2";
    el.style.fontFamily = "monospace";
    el.style.fontSize = "13px";
    el.style.borderRadius = "8px";
    el.style.border = "2px solid #ef4444";
    el.style.boxShadow = "0 12px 30px rgba(0,0,0,0.6)";
    el.style.whiteSpace = "pre-wrap";
    el.style.maxHeight = "60vh";
    el.style.overflow = "auto";
    document.body.appendChild(el);
  }
  el.innerHTML = `<h3 style="margin:0 0 10px 0; color:#fca5a5;">⚠️ ${title}</h3><div style="background:#450a0a;padding:12px;border-radius:6px;overflow-x:auto;">${msg}</div><button onclick="window.location.reload();" style="margin-top:12px;padding:6px 16px;background:#ef4444;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">刷新重试 (Reload)</button>`;
}

window.addEventListener("error", (e) => {
  const msg = e.message || "";
  if (
    msg.includes("ResizeObserver loop") ||
    msg.includes("ResizeObserver loop completed") ||
    msg.includes("Script error")
  ) {
    e.stopImmediatePropagation();
    return;
  }
  console.warn("[Window error caught]", e.error || e.message);
});

window.addEventListener("unhandledrejection", (e) => {
  // Mark rejection as handled to prevent browser / runtime crashes
  e.preventDefault();
  const reason = e.reason;
  const msg = (reason && (reason.message || String(reason))) || "";
  if (
    msg.includes("ResizeObserver") ||
    msg.includes("Failed to fetch") ||
    msg.includes("aborted") ||
    msg.includes("websocket") ||
    msg.includes("network")
  ) {
    return;
  }
  console.warn("[Handled Promise Rejection]", reason);
});

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class RootErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[RootErrorBoundary]", error, errorInfo);
    this.setState({ errorInfo });
    showErrorOverlay(
      "React 组件渲染错误 (React Render Crash)",
      (error?.stack || error?.message) + "\n\nComponent Stack:\n" + errorInfo.componentStack
    );
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, background: "#18181c", color: "#f87171", fontFamily: "monospace", minHeight: "100vh" }}>
          <h2 style={{ color: "#ef4444", marginBottom: 12 }}>⚠️ 页面加载异常 (Runtime Error Caught)</h2>
          <div style={{ background: "#26262b", padding: 14, borderRadius: 6, border: "1px solid #dc2626", marginBottom: 16 }}>
            <strong>{this.state.error?.name}: </strong>{this.state.error?.message}
          </div>
          <pre style={{ whiteSpace: "pre-wrap", color: "#9ca3af", fontSize: 12, background: "#121214", padding: 12, borderRadius: 4 }}>
            {this.state.error?.stack}
            {"\n\nComponent Stack:\n"}
            {this.state.errorInfo?.componentStack}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: 16, padding: "8px 16px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}
          >
            刷新页面 (Reload Page)
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  );
}

