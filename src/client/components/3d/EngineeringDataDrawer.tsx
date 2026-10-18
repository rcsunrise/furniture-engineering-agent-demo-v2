import React, { useRef } from "react";
import {
  FileSpreadsheet,
  X,
  Upload,
  FolderOpen,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Sparkles,
} from "lucide-react";
import type { AssemblyDocument } from "../../../shared/assembly.js";

interface EngineeringDataDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  assembly?: AssemblyDocument | null;
  onUploadFile?: (file: File) => void;
  onLoadSample?: () => void;
  validationReport?: any;
}

export const EngineeringDataDrawer: React.FC<EngineeringDataDrawerProps> = ({
  isOpen,
  onClose,
  assembly,
  onUploadFile,
  onLoadSample,
  validationReport,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const components = assembly?.components || [];
  const hasData = components.length > 0;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onUploadFile) {
      onUploadFile(file);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-start bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
      {/* Click backdrop to close */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Drawer content */}
      <div className="relative w-80 max-w-full h-full bg-neutral-900 border-r border-neutral-800 shadow-2xl flex flex-col text-neutral-200 text-xs z-10 animate-in slide-in-from-left duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 bg-neutral-950">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span className="font-semibold text-white tracking-wide">
              工程数据连接 (FES Data)
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-neutral-800 text-neutral-400 hover:text-white rounded transition"
            title="关闭 (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Status card */}
          <div className="bg-neutral-950/80 border border-neutral-800 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-neutral-400 text-[11px]">连接状态</span>
              {hasData ? (
                <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  已连接 (Connected)
                </span>
              ) : (
                <span className="text-[11px] text-neutral-500 font-medium">
                  未加载工程文件
                </span>
              )}
            </div>

            {hasData && (
              <div className="border-t border-neutral-800/80 pt-2 space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-neutral-400">产品 SKU:</span>
                  <span className="text-white font-mono">{(assembly as any)?.sku || (assembly as any)?.productSku || "SOFA-01"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">构件数量:</span>
                  <span className="text-white font-mono">{components.length} 个零件</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">工程单位:</span>
                  <span className="text-white font-mono">mm (标准制)</span>
                </div>
              </div>
            )}
          </div>

          {/* Upload / Replace Excel Section */}
          <div className="space-y-2">
            <label className="text-[11px] font-semibold text-neutral-300 block">
              导入或更新工程表 (Excel / FES)
            </label>
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file && onUploadFile) {
                  onUploadFile(file);
                  e.target.value = "";
                }
              }}
              accept=".xlsx,.xls,.csv,.json"
              style={{ position: "absolute", width: 0, height: 0, opacity: 0, overflow: "hidden" }}
            />
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-neutral-700 hover:border-emerald-500/80 rounded-xl p-5 text-center cursor-pointer transition-colors bg-neutral-950/40 hover:bg-neutral-950/80 group"
            >
              <Upload className="w-6 h-6 mx-auto mb-2 text-neutral-500 group-hover:text-emerald-400 transition-colors" />
              <p className="font-medium text-neutral-300 text-xs">点击或拖拽上传 Excel 表</p>
              <p className="text-[10px] text-neutral-500 mt-1">支持 .xlsx, .xls, .json 格式</p>
            </div>

            {onLoadSample && (
              <button
                onClick={() => {
                  onLoadSample();
                  onClose();
                }}
                className="w-full py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg font-medium transition flex items-center justify-center gap-1.5 text-xs mt-2"
              >
                <FolderOpen className="w-3.5 h-3.5 text-indigo-400" />
                加载官方测试工程样本 (Sample)
              </button>
            )}
          </div>

          {/* Component list summary if available */}
          {hasData && (
            <div className="space-y-2 pt-2 border-t border-neutral-800">
              <div className="flex items-center justify-between text-[11px] font-semibold text-neutral-300">
                <span className="flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-indigo-400" />
                  工程构件清单 ({components.length})
                </span>
              </div>
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {components.map((c, cIdx) => (
                  <div
                    key={`${c.id || "comp"}_${cIdx}`}
                    className="p-2 bg-neutral-950/60 border border-neutral-800/80 rounded-lg flex items-center justify-between text-[11px]"
                  >
                    <span className="font-medium text-white truncate max-w-[140px]">{c.id}</span>
                    <span className="text-[10px] text-neutral-400 font-mono">
                      {c.size?.x}×{c.size?.y}×{c.size?.z}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-neutral-800 bg-neutral-950 flex justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded text-xs transition"
          >
            完成并收起
          </button>
        </div>
      </div>
    </div>
  );
};
