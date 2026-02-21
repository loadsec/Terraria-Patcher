import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./i18n";
import App from "./App";

window.onerror = function (message, source, lineno, colno, error) {
  document.getElementById("root")!.innerHTML = `
    <div style="padding: 20px; background: #220000; color: #ff5555; height: 100vh; overflow: auto; font-family: monospace;">
      <h2 style="color: white; margin-bottom: 20px;">Fatal Render Error:</h2>
      <p><b>Message:</b> ${message}</p>
      <p><b>Source:</b> ${source}:${lineno}:${colno}</p>
      <pre style="white-space: pre-wrap; margin-top: 20px; padding: 15px; background: #000;">${error?.stack || "No stack trace available"}</pre>
    </div>
  `;
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
