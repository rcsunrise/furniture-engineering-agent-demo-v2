import React, { useState, useEffect } from "react";
import {
  Layers,
  Box,
  Compass,
  Palette,
  FileCode2,
  Settings,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import type { Engineering3DEditor } from "../Engineering3DEditor.js";
import { SceneTab } from "./tabs/SceneTab.js";
import { ObjectTab } from "./tabs/ObjectTab.js";
import { GeometryTab } from "./tabs/GeometryTab.js";
import { MaterialTab } from "./tabs/MaterialTab.js";
import { EngineeringTab } from "./tabs/EngineeringTab.js";
import { SettingsTab } from "./tabs/SettingsTab.js";

interface EditorSidebarProps {
  editor: Engineering3DEditor;
  assemblyDoc?: any;
}

type SidebarTab = "scene" | "object" | "geometry" | "material" | "engineering" | "settings";

export const EditorSidebar: React.FC<EditorSidebarProps> = ({ editor, assemblyDoc }) => {
  const [activeTab, setActiveTab] = useState<SidebarTab>("scene");
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    const unsub1 = editor.signals.sidebarTabChanged.add((tabName: string) => {
      if (
        ["scene", "object", "geometry", "material", "engineering", "settings"].includes(tabName)
      ) {
        setActiveTab(tabName as SidebarTab);
        setIsCollapsed(false);
      }
    });

    // When an object is selected, if user was in scene tab, we can optionally keep or auto-refresh
    const unsub2 = editor.signals.objectSelected.add(() => {
      setTick((t) => t + 1);
    });

    return () => {
      unsub1();
      unsub2();
    };
  }, [editor]);

  const tabs: { id: SidebarTab; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: "scene", label: "场景", icon: Layers },
    { id: "object", label: "对象", icon: Box },
    { id: "geometry", label: "几何", icon: Compass },
    { id: "material", label: "材质", icon: Palette },
    { id: "engineering", label: "工程", icon: FileCode2 },
    { id: "settings", label: "设置", icon: Settings },
  ];

  if (isCollapsed) {
    return (
      <div className="w-10 bg-[#1e2024] border-l border-[#2e3238] flex flex-col items-center py-2 space-y-2 z-20 select-none">
        <button
          onClick={() => setIsCollapsed(false)}
          className="p-1.5 rounded hover:bg-[#2c3036] text-neutral-400 hover:text-neutral-200"
          title="展开侧边栏"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="h-[1px] w-6 bg-[#33373e]" />
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setIsCollapsed(false);
              }}
              className={`p-1.5 rounded text-xs transition-colors ${
                activeTab === tab.id
                  ? "bg-blue-600 text-white"
                  : "text-neutral-400 hover:text-neutral-200 hover:bg-[#2c3036]"
              }`}
              title={tab.label}
            >
              <Icon className="w-4 h-4" />
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <aside className="w-80 min-w-[320px] max-w-[340px] bg-[#1a1c20] border-l border-[#2e3238] flex flex-col h-full z-20 select-none">
      {/* Sidebar Header with Tabs */}
      <div className="h-[34px] min-h-[34px] bg-[#16181b] border-b border-[#2e3238] flex items-center justify-between px-1 text-xs">
        <div className="flex items-center space-x-0.5 overflow-x-auto no-scrollbar">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-1 px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                  isActive
                    ? "bg-[#25282e] text-blue-400 border-b-2 border-blue-500 rounded-b-none"
                    : "text-neutral-400 hover:text-neutral-200 hover:bg-[#22252a]"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <button
          onClick={() => setIsCollapsed(true)}
          className="p-1 text-neutral-400 hover:text-neutral-200 hover:bg-[#25282e] rounded"
          title="折叠侧边栏"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Tab Content Panel */}
      <div className="flex-1 overflow-y-auto bg-[#1a1c20]">
        {activeTab === "scene" && <SceneTab editor={editor} />}
        {activeTab === "object" && <ObjectTab editor={editor} />}
        {activeTab === "geometry" && <GeometryTab editor={editor} />}
        {activeTab === "material" && <MaterialTab editor={editor} />}
        {activeTab === "engineering" && (
          <EngineeringTab editor={editor} assemblyDoc={assemblyDoc} />
        )}
        {activeTab === "settings" && <SettingsTab editor={editor} />}
      </div>
    </aside>
  );
};
