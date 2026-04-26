import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Bypass when explicitly set, or when SSO vars are absent (unconfigured local dev).
const DEV_BYPASS =
  import.meta.env.VITE_DEV_BYPASS_AUTH === "true" ||
  !import.meta.env.VITE_WISE_AUTH_URL;

function mount() {
  createRoot(document.getElementById("root")!).render(<App />);
}

if (DEV_BYPASS) {
  mount();
} else {
  // Dynamically import auth only when SSO is active — keeps local dev bundle clean.
  import("@/lib/auth").then(({ isAuthenticated, redirectToLogin, handleCallback }) => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");

    if (code && state) {
      handleCallback(code, state)
        .then(() => {
          window.history.replaceState({}, "", "/");
          mount();
        })
        .catch((err) => {
          console.error("Auth callback failed:", err);
          redirectToLogin();
        });
    } else if (!isAuthenticated()) {
      redirectToLogin();
    } else {
      mount();
    }
  });
}
