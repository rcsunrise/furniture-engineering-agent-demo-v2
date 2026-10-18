import React from "react";
import {
  MousePointer,
  Move,
  RotateCcw,
  Maximize2,
  Scissors,
  Ruler,
  SplitSquareVertical,
  Maximize,
  Minimize,
} from "lucide-react";
import type { InteractionMode } from "./ViewToolbar.js";

interface VerticalToolDockProps {
  interactionMode: InteractionMode;
  onSelectInteractionMode: (mode: InteractionMode) => void;
  isFocusView: boolean;
  onToggleFocusView: () => void;
}

export const VerticalToolDock: React.FC<VerticalToolDockProps> = ({
  interactionMode,
  onSelectInteractionMode,
  isFocusView,
  onToggleFocusView,
}) => {
  const tools: Array<{
    mode: InteractionMode;
    label: string;
    shortcut: string;
    icon: React.ComponentType<{ className?: string }>;
    accentClass: string;
  }> = [
    {
      mode: "select",
      label: "选择",
      shortcut: "Q / Esc",
      icon: MousePointer,
      accentClass: "bg-indigo-600 text-white shadow-md shadow-indigo-900/40",
    },
    {
      mode: "translate",
      label: "位移",
      shortcut: "W",
      icon: Move,
      accentClass: "bg-indigo-600 text-white shadow-md shadow-indigo-900/40",
    },
    {
      mode: "rotate",
      label: "旋转",
      shortcut: "E",
      icon: RotateCcw,
      accentClass: "bg-indigo-600 text-white shadow-md shadow-indigo-900/40",
    },
    {
      mode: "scale",
      label: "缩放",
      shortcut: "R",
      icon: Maximize2,
      accentClass: "bg-indigo-600 text-white shadow-md shadow-indigo-900/40",
    },
    {
      mode: "split",
      label: "拆分",
      shortcut: "Split",
      icon: Scissors,
      accentClass: "bg-amber-600 text-white shadow-md shadow-amber-900/40",
    },
    {
      mode: "measure",
      label: "测量",
      shortcut: "Measure",
      icon: Ruler,
      accentClass: "bg-emerald-600 text-white shadow-md shadow-emerald-900/40",
    },
    {
      mode: "section",
      label: "剖切",
      shortcut: "Section",
      icon: SplitSquareVertical,
      accentClass: "bg-cyan-600 text-white shadow-md shadow-cyan-900/40",
    },
  ];

  return (
    <div
      id="vertical-tool-dock"
      className="w-12 bg-neutral-950/90 backdrop-blur-md border-r border-neutral-800/80 flex flex-col items-center py-2.5 justify-between select-none z-20 shrink-0"
    >
      {/* Tool items */}
      <div className="flex flex-col items-center gap-1.5 w-full px-1.5">
        {tools.map((tool) => {
          const Icon = tool.icon;
          const isActive = interactionMode === tool.mode;
          return (
            <button
              key={tool.mode}
              id={`tool-btn-${tool.mode}`}
              onClick={() => onSelectInteractionMode(tool.mode)}
              className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-150 relative group ${
                isActive
                  ? tool.accentClass
                  : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/80"
              }`}
              title={`${tool.label} (${tool.shortcut})`}
            >
              <Icon className="w-4 h-4" />

              {/* Tooltip flyout on hover */}
              <div className="absolute left-full ml-2.5 px-2 py-1 bg-neutral-900 border border-neutral-700/80 rounded shadow-xl text-[11px] font-medium text-neutral-200 whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 flex items-center gap-1.5">
                <span>{tool.label}</span>
                <span className="text-[10px] text-neutral-400 font-mono bg-neutral-800 px-1 rounded">
                  {tool.shortcut}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Focus View / Maximize toggle at bottom */}
      <div className="w-full px-1.5 border-t border-neutral-800/80 pt-2 flex flex-col items-center">
        <button
          id="tool-btn-focus-view"
          onClick={onToggleFocusView}
          className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-150 relative group ${
            isFocusView
              ? "bg-purple-600 text-white shadow-md shadow-purple-900/40"
              : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/80"
          }`}
          title={isFocusView ? "退出专注模式 (Space)" : "全屏最大化视口 (Space)"}
        >
          {isFocusView ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}

          {/* Tooltip */}
          <div className="absolute left-full ml-2.5 px-2 py-1 bg-neutral-900 border border-neutral-700/80 rounded shadow-xl text-[11px] font-medium text-neutral-200 whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 flex items-center gap-1.5">
            <span>{isFocusView ? "恢复工作区" : "最大化视口"}</span>
            <span className="text-[10px] text-neutral-400 font-mono bg-neutral-800 px-1 rounded">
              Space
            </span>
          </div>
        </button>
      </div>
    </div>
  );
};
