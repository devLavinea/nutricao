import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Registra o Service Worker necessário para o PWA.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch((erro) => {
      console.warn("Não foi possível registrar o Service Worker:", erro);
    });
  });
}
