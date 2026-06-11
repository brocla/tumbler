import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/global.css";
import { applySystemAccentColor } from "./utils/systemTheme";

// Apply accent color on load, then re-apply whenever the window regains
// focus (catches the user changing their Windows accent color and alt-tabbing back).
applySystemAccentColor();
window.addEventListener("focus", applySystemAccentColor);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
