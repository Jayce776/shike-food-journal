import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import { ensureSeedData } from "./db";
import "./styles.css";

registerSW({ immediate: true });

function renderApp() {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]!);
}

function renderStartupError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const root = document.getElementById("root");
  if (!root) return;
  root.innerHTML = `
    <main style="max-width:480px;margin:0 auto;padding:64px 22px;color:#203126;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
      <section style="padding:22px;border:1px solid #d9e6d7;border-radius:24px;background:#fffefb;box-shadow:0 12px 36px rgba(48,78,54,.08)">
        <p style="margin:0 0 8px;color:#5d7863;font-size:13px;font-weight:700">食刻 v0.9.1</p>
        <h1 style="margin:0 0 10px;font-size:24px">启动没有完成</h1>
        <p style="margin:0 0 16px;line-height:1.7">请先关闭此页面再重新打开。如果仍然出现这里，把下方错误文字发给我。</p>
        <pre style="white-space:pre-wrap;word-break:break-word;padding:12px;border-radius:14px;background:#f2f7f0;color:#516057;font-size:12px">${escapeHtml(message)}</pre>
        <button onclick="location.reload()" style="width:100%;margin-top:14px;padding:13px;border:0;border-radius:14px;background:#4f7658;color:white;font-size:16px;font-weight:700">重新加载</button>
      </section>
    </main>`;
}

ensureSeedData().then(renderApp).catch(renderStartupError);
