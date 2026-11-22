import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import "./styles.css";
import { App } from "./App.tsx";

const el = document.getElementById("root");
if (el) createRoot(el).render(<StrictMode><App /></StrictMode>);
