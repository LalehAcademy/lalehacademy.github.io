/*
 * Laleh Academy — shared helpers
 * No secrets, no external calls other than fetching the local JSON registry.
 */

const LalehUtils = (() => {

  /** Escape a string for safe insertion into HTML text content. */
  function escapeHTML(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /**
   * Validate a certificate ID against the expected format: LA-YYYY-XXXXXX
   * This is the ONLY thing we trust from the URL before using it as a
   * lookup key. Anything that doesn't match is treated as "not found"
   * rather than passed into a query or the DOM unescaped.
   */
  const ID_PATTERN = /^LA-(20\d{2})-(\d{6})$/;

  function normalizeId(raw) {
    if (!raw) return null;
    const trimmed = String(raw).trim().toUpperCase();
    return ID_PATTERN.test(trimmed) ? trimmed : null;
  }

  function isValidId(raw) {
    return normalizeId(raw) !== null;
  }

  /** Read a query parameter safely. */
  function getQueryParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
  }

  /**
   * Extract a certificate ID from either:
   *  - /verify/?id=LA-2026-000184
   *  - /certificates/LA-2026-000184  (rewritten via 404.html -> ?cert=)
   *  - /certificates/index.html?cert=LA-2026-000184
   */
  function extractCertificateId() {
    const fromVerify = getQueryParam("id");
    if (fromVerify) return fromVerify;

    const fromCleanUrl = getQueryParam("cert");
    if (fromCleanUrl) return fromCleanUrl;

    // Fallback: /certificates/LA-2026-000184 served directly (e.g. local
    // static server with directory routing) — read the last path segment.
    const parts = window.location.pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1];
    if (last && last.toUpperCase().startsWith("LA-")) return last;

    return null;
  }

  /** Format an ISO date (YYYY-MM-DD) for display. Falls back to raw string. */
  function formatDate(iso, locale = "en") {
    if (!iso) return null;
    const d = new Date(iso + "T00:00:00");
    if (isNaN(d.getTime())) return iso;
    const localeTag = locale === "ar" ? "ar-IQ" : "en-GB";
    try {
      return new Intl.DateTimeFormat(localeTag, {
        year: "numeric", month: "long", day: "numeric"
      }).format(d);
    } catch (e) {
      return iso;
    }
  }

  /** Fetch the certificate registry. Returns a Map keyed by certificate id. */
  async function loadRegistry() {
    const res = await fetch("/data/certificates.json", { cache: "no-store" });
    if (!res.ok) throw new Error("registry-unreachable");
    const data = await res.json();
    if (!Array.isArray(data.certificates)) throw new Error("registry-malformed");
    const map = new Map();
    for (const record of data.certificates) {
      if (record && typeof record.id === "string") {
        map.set(record.id.toUpperCase(), record);
      }
    }
    return map;
  }

  /** Basic shape check so a malformed record fails safely, not silently. */
  function isWellFormedRecord(rec) {
    if (!rec || typeof rec !== "object") return false;
    const requiredStrings = ["id", "recipient", "certificate", "issuer", "issueDate", "status"];
    return requiredStrings.every((k) => typeof rec[k] === "string" && rec[k].length > 0);
  }

  return {
    escapeHTML,
    normalizeId,
    isValidId,
    getQueryParam,
    extractCertificateId,
    formatDate,
    loadRegistry,
    isWellFormedRecord,
    ID_PATTERN,
  };
})();
