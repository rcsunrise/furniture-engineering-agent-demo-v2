import React from "react";
import {createRoot} from "react-dom/client";
import {App} from "./App";

window.addEventListener("error", (e) => {
  if (e.message && (e.message.includes("ResizeObserver loop") || e.message.includes("ResizeObserver loop completed"))) {
    e.stopImmediatePropagation();
  }
});

createRoot(document.getElementById("root")!).render(<App/>);

