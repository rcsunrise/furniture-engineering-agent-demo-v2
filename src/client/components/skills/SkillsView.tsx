import React, { useState } from "react";
import { StorageDiagnosticsPanel } from "../diagnostics/StorageDiagnosticsPanel.js";
import { Cloud, Wrench, Package, Terminal } from "lucide-react";

export function SkillsView() {
  const [subTab, setSubTab] = useState<"STORAGE_DIAG" | "MARKETPLACE">("STORAGE_DIAG");

  return (
    <div className="w-full h-full flex flex-col min-h-0 bg-[#121215]">
      {/* Sub-Navigation Bar */}
      <div className="flex items-center justify-between px-6 py-2.5 bg-[#17171d] border-b border-[#262633]">
        <div className="flex items-center gap-2">
          <button
            id="subtab-storage-diagnostics"
            onClick={() => setSubTab("STORAGE_DIAG")}
            className={`px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              subTab === "STORAGE_DIAG"
                ? "bg-[#4fc3f7] text-black shadow"
                : "bg-[#22222b] text-[#a0a0b0] hover:text-white"
            }`}
          >
            <Cloud className="w-3.5 h-3.5" />
            开发者 / 云存储诊断 (Storage Diagnostics)
          </button>
          <button
            id="subtab-skills-marketplace"
            onClick={() => setSubTab("MARKETPLACE")}
            className={`px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              subTab === "MARKETPLACE"
                ? "bg-[#4fc3f7] text-black shadow"
                : "bg-[#22222b] text-[#a0a0b0] hover:text-white"
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            技能扩展市场 (Skills Marketplace)
          </button>
        </div>

        <div className="text-xs text-[#717182] font-mono flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-[#4fc3f7]" />
          <span>G-INFRA-STORAGE-01B 诊断已就绪 (Diagnostics Active)</span>
        </div>
      </div>

      {/* Sub-Tab Content Viewport */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {subTab === "STORAGE_DIAG" ? (
          <StorageDiagnosticsPanel />
        ) : (
          <div className="p-8 text-[#ccc] max-w-4xl">
            <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
              <Wrench className="w-5 h-5 text-[#4fc3f7]" />
              工程技能扩展 (Skills Registry)
            </h2>
            <p className="text-sm text-[#8e8e9c] mb-6">
              Demo 1.0 预留技能扩展接口与规则体系；后续版本将启用动态 Tool Registry 与智能体能力调度。
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
              <div className="p-4 rounded-lg bg-[#181820] border border-[#2c2c38]">
                <div className="text-white font-bold text-sm mb-1">GCS 云存储服务 (G-INFRA-STORAGE-01)</div>
                <div className="text-[#8e8e9c]">
                  规范化对象路径结构、两阶段上传会话协议与短生命周期 v4 HMAC 签名 URL 安全访问。
                </div>
                <div className="mt-3 text-[#4ade80]">状态: 已就绪 (READY)</div>
              </div>

              <div className="p-4 rounded-lg bg-[#181820] border border-[#2c2c38]">
                <div className="text-white font-bold text-sm mb-1">本地 3D 网格 Worker 计算节点 (G4-3)</div>
                <div className="text-[#8e8e9c]">
                  基于长轮询 Worker Gateway 的 Hunyuan3D / ComfyUI 外部计算桥梁。
                </div>
                <div className="mt-3 text-[#4fc3f7]">状态: 已注册 (REGISTERED)</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
