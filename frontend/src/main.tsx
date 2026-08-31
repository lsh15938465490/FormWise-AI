import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "@/app";
import { bootstrapPlugins } from "@/plugins/bootstrap";
import "./index.css";

bootstrapPlugins();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
