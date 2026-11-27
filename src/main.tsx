import "@fontsource/manrope/400.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import React from "react";
import ReactDOM from "react-dom/client";
import "ldrs/tailspin"; // auto-defining import — otomatis meregister
// custom element <l-tail-spin> begitu file ini dimuat.
import App from "./App";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
