/*
 * Laleh Academy — admin session gate
 *
 * Protects the generator UI behind a password check. See auth-config.js
 * for the honest limitations of what this can and can't guarantee on a
 * static site. Session state lives in sessionStorage (cleared when the
 * tab/browser closes) and expires after inactivity — never the password
 * itself, only a timestamped "I checked out" flag.
 */

const LalehAuth = (() => {
  const SESSION_KEY = "laleh_admin_session";

  async function sha256Hex(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function readSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (typeof data.ts !== "number") return null;
      return data;
    } catch (e) {
      return null;
    }
  }

  function isSessionValid() {
    const session = readSession();
    if (!session) return false;
    const maxAgeMs = LalehAuthConfig.SESSION_TIMEOUT_MINUTES * 60 * 1000;
    return (Date.now() - session.ts) < maxAgeMs;
  }

  function touchSession() {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ts: Date.now() }));
  }

  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  async function tryPassword(candidate) {
    const hash = await sha256Hex(candidate);
    const ok = hash === LalehAuthConfig.ADMIN_PASSWORD_HASH;
    if (ok) touchSession();
    return ok;
  }

  /**
   * Wire up a gate. Expects these elements in the DOM:
   *   #authGate          wrapper shown when not authenticated
   *   #authForm           <form> with a password input
   *   #authPassword       <input type="password">
   *   #authError          element for the error message
   *   #adminApp           wrapper shown when authenticated
   *   #logoutBtn          (optional) inside #adminApp
   * Calls onUnlock() once, every time the app becomes visible/unlocked.
   */
  function initGate({ onUnlock } = {}) {
    const gate = document.getElementById("authGate");
    const app = document.getElementById("adminApp");
    const form = document.getElementById("authForm");
    const input = document.getElementById("authPassword");
    const err = document.getElementById("authError");
    const logoutBtn = document.getElementById("logoutBtn");

    function show(unlocked) {
      gate.style.display = unlocked ? "none" : "";
      app.style.display = unlocked ? "" : "none";
      if (unlocked && typeof onUnlock === "function") onUnlock();
    }

    // Any click/keystroke while unlocked resets the inactivity clock.
    ["click", "keydown", "mousemove"].forEach((evt) => {
      document.addEventListener(evt, () => { if (isSessionValid()) touchSession(); }, { passive: true });
    });

    // Poll for expiry so a long-idle tab gets kicked back to the gate
    // without needing a page reload.
    setInterval(() => {
      if (app.style.display !== "none" && !isSessionValid()) {
        clearSession();
        show(false);
        err.textContent = "Session expired due to inactivity. Please sign in again.";
      }
    }, 15000);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      err.textContent = "";
      const val = input.value;
      input.value = "";
      if (!val) return;
      const ok = await tryPassword(val);
      if (ok) {
        show(true);
      } else {
        err.textContent = "Incorrect password. Please try again.";
        input.focus();
      }
    });

    if (logoutBtn) {
      logoutBtn.addEventListener("click", () => {
        clearSession();
        show(false);
      });
    }

    show(isSessionValid());
  }

  return { initGate, isSessionValid, clearSession, touchSession };
})();
