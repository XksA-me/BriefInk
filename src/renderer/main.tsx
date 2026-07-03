import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import { installBrowserMockApi } from "./browserMock";
import "./styles.css";

if (!navigator.userAgent.includes("Electron")) {
  installBrowserMockApi();
}

console.info(
  `BriefInk renderer boot electron=${navigator.userAgent.includes("Electron")} hasBridge=${Boolean(window.briefInk)}`
);

function MissingBridge() {
  return (
    <div className="fatalScreen">
      <h1>BriefInk could not connect to the desktop bridge</h1>
      <p>Restart the app and check the logs folder for preload errors.</p>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>{window.briefInk ? <App /> : <MissingBridge />}</ErrorBoundary>
  </React.StrictMode>
);
