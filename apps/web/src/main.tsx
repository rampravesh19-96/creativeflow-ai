import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ClerkProvider } from "@clerk/clerk-react";
import App from "./App";
import "./index.css";
const key = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const tree = (
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
createRoot(document.getElementById("root")!).render(
  key ? <ClerkProvider publishableKey={key}>{tree}</ClerkProvider> : tree,
);
