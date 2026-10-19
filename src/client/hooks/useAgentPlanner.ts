import { useState } from "react";
import { parseApiResponse } from "../api.js";

export function useAgentPlanner() {
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState("");
  const [agentResult, setAgentResult] = useState<string | null>(null);

  async function handleRunPlan(currentFes: any) {
    if (!prompt.trim()) return;
    setStatus("正在请求 Agent 规则解析...");
    try {
      const res = await fetch("/api/engineering/agent/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "routerhub",
          reasoning: "medium",
          input: {
            userInstruction: prompt,
            activeFes: currentFes || null,
          },
        }),
      });

      const parsed = await parseApiResponse<any>(res, "/api/engineering/agent/plan", "POST");
      if (parsed.ok) {
        setAgentResult(JSON.stringify(parsed.data, null, 2));
        setStatus("规划生成完毕");
      } else {
        setAgentResult(JSON.stringify(parsed.data, null, 2));
        setStatus("规划失败");
      }
    } catch (e: any) {
      setAgentResult(`Error: ${e?.message || String(e)}`);
      setStatus("请求网络失败");
    }
  }

  return {
    prompt,
    setPrompt,
    status,
    agentResult,
    runPlan: handleRunPlan,
  };
}
