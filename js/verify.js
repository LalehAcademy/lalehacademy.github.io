/*
 * Laleh Academy — verification page controller
 * Renders exactly one of: loading / valid / revoked / expired / pending / not-found / error
 * All record fields are inserted via textContent, never innerHTML, so a
 * malicious value in the registry (or a compromised JSON file) cannot
 * execute script in a visitor's browser.
 */
(function () {
  const root = document.getElementById("verifyRoot");

  const SEALS = {
    ok: `<svg class="status-seal" viewBox="0 0 64 64" role="img" aria-hidden="true">
      <circle cx="32" cy="32" r="30" fill="#1E7F4F" opacity="0.12"/>
      <circle cx="32" cy="32" r="24" fill="none" stroke="#1E7F4F" stroke-width="2.5"/>
      <path d="M21 33 L28.5 40.5 L44 24" fill="none" stroke="#1E7F4F" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
    warn: `<svg class="status-seal" viewBox="0 0 64 64" role="img" aria-hidden="true">
      <circle cx="32" cy="32" r="30" fill="#93630B" opacity="0.12"/>
      <circle cx="32" cy="32" r="24" fill="none" stroke="#93630B" stroke-width="2.5"/>
      <line x1="32" y1="20" x2="32" y2="36" stroke="#93630B" stroke-width="4" stroke-linecap="round"/>
      <circle cx="32" cy="44" r="2.6" fill="#93630B"/>
    </svg>`,
    bad: `<svg class="status-seal" viewBox="0 0 64 64" role="img" aria-hidden="true">
      <circle cx="32" cy="32" r="30" fill="#A3271F" opacity="0.12"/>
      <circle cx="32" cy="32" r="24" fill="none" stroke="#A3271F" stroke-width="2.5"/>
      <line x1="23" y1="23" x2="41" y2="41" stroke="#A3271F" stroke-width="4" stroke-linecap="round"/>
      <line x1="41" y1="23" x2="23" y2="41" stroke="#A3271F" stroke-width="4" stroke-linecap="round"/>
    </svg>`,
    pending: `<svg class="status-seal" viewBox="0 0 64 64" role="img" aria-hidden="true">
      <circle cx="32" cy="32" r="30" fill="#3B4482" opacity="0.12"/>
      <circle cx="32" cy="32" r="24" fill="none" stroke="#3B4482" stroke-width="2.5"/>
      <line x1="32" y1="22" x2="32" y2="33" stroke="#3B4482" stroke-width="4" stroke-linecap="round"/>
      <line x1="32" y1="33" x2="40" y2="37" stroke="#3B4482" stroke-width="4" stroke-linecap="round"/>
    </svg>`,
  };

  const STATUS_CONTENT = {
    valid: {
      cls: "ok", seal: "ok", tag: "Verified",
      heading: "Authentic Certificate",
      body: "This certificate has been successfully verified against the Laleh Academy official certificate registry.",
    },
    revoked: {
      cls: "warn", seal: "warn", tag: "Revoked",
      heading: "Certificate Revoked",
      body: "This certificate was previously issued but is no longer considered valid by Laleh Academy.",
    },
    expired: {
      cls: "warn", seal: "warn", tag: "Expired",
      heading: "Certificate Expired",
      body: "This certificate was valid at the time of issue but has since passed its validity period.",
    },
    pending: {
      cls: "pending", seal: "pending", tag: "Pending",
      heading: "Registration Pending",
      body: "This certificate has been generated but has not yet completed final registration by Laleh Academy.",
    },
  };

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (k === "class") node.className = v;
        else if (k === "html") node._html = v;
        else node.setAttribute(k, v);
      }
    }
    (children || []).forEach((c) => {
      if (c === null || c === undefined) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  function renderLoading() {
    root.innerHTML = "";
    root.appendChild(el("div", { class: "loading", role: "status", "aria-live": "polite" }, [
      el("div", { class: "spinner" }),
      el("p", null, ["Checking the Laleh Academy certificate registry…"]),
    ]));
  }

  function renderNotFound(id) {
    root.innerHTML = "";
    const band = el("div", { class: "status-band status-band--bad", role: "status", "aria-live": "polite" }, [
      wrapSVG(SEALS.bad),
      el("h2", null, ["Certificate Not Found"]),
      el("p", null, [
        id
          ? `We could not verify certificate ${id} in the Laleh Academy certificate registry.`
          : "We could not verify this certificate in the Laleh Academy certificate registry.",
      ]),
      el("ul", { class: "reasons" }, [
        el("li", null, ["The certificate ID may be incorrect or mistyped."]),
        el("li", null, ["The certificate has not been registered yet."]),
        el("li", null, ["The certificate may not have been issued by Laleh Academy."]),
      ]),
      el("span", { class: "status-tag" }, ["Not Found"]),
    ]);
    root.appendChild(band);
    root.appendChild(searchAgainBlock());
  }

  function renderInvalidId(rawId) {
    root.innerHTML = "";
    const band = el("div", { class: "status-band status-band--bad", role: "status", "aria-live": "polite" }, [
      wrapSVG(SEALS.bad),
      el("h2", null, ["Certificate Not Found"]),
      el("p", null, ["The certificate ID in this link is not a valid Laleh Academy format. Expected format: LA-2026-000184."]),
      el("span", { class: "status-tag" }, ["Invalid ID"]),
    ]);
    root.appendChild(band);
    root.appendChild(searchAgainBlock());
  }

  function renderMalformed(id) {
    root.innerHTML = "";
    const band = el("div", { class: "status-band status-band--warn", role: "status", "aria-live": "polite" }, [
      wrapSVG(SEALS.warn),
      el("h2", null, ["Verification Unavailable"]),
      el("p", null, [`Certificate ${id} was found but its registry record is incomplete. Please contact Laleh Academy to confirm this certificate directly.`]),
      el("span", { class: "status-tag" }, ["Data Issue"]),
    ]);
    root.appendChild(band);
    root.appendChild(searchAgainBlock());
  }

  function renderError() {
    root.innerHTML = "";
    const band = el("div", { class: "status-band status-band--warn", role: "status", "aria-live": "polite" }, [
      wrapSVG(SEALS.warn),
      el("h2", null, ["Verification Temporarily Unavailable"]),
      el("p", null, ["We couldn't reach the Laleh Academy certificate registry. Please check your connection and try again."]),
      el("span", { class: "status-tag" }, ["Try Again"]),
    ]);
    root.appendChild(band);
    root.appendChild(searchAgainBlock());
  }

  function wrapSVG(svgString) {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = svgString; // fixed, developer-authored markup only — no user data
    return wrapper.firstElementChild;
  }

  function searchAgainBlock() {
    const wrap = el("div", { class: "search-card" }, []);
    const form = document.createElement("form");
    form.id = "againForm";
    const field = el("div", { class: "search-field" }, [
      el("label", { for: "againId" }, ["Try another certificate ID"]),
    ]);
    const input = document.createElement("input");
    input.type = "text";
    input.id = "againId";
    input.name = "againId";
    input.placeholder = "LA-2026-000184";
    input.autocomplete = "off";
    field.appendChild(input);
    const btn = el("button", { type: "submit", class: "btn btn-primary" }, ["Verify"]);
    form.style.display = "flex";
    form.style.gap = "10px";
    form.style.flexWrap = "wrap";
    form.appendChild(field);
    form.appendChild(btn);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const normalized = LalehUtils.normalizeId(input.value);
      if (normalized) window.location.href = "/verify/?id=" + encodeURIComponent(normalized);
    });
    wrap.appendChild(form);
    return wrap;
  }

  function statusDate() {
    return new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date());
  }

  function credItem(label, value, opts) {
    opts = opts || {};
    if (!value) return null;
    const dd = el("dd", { class: opts.mono ? "mono" : "" }, [value]);
    return el("div", { class: "cred-item" + (opts.full ? " cred-item--full" : "") }, [
      el("dt", null, [label]),
      dd,
    ]);
  }

  /*
   * Certificate preview + verification seal.
   *
   * The seal is a UI overlay only — it is never baked into the certificate
   * file itself, and it never appears from a URL parameter or client-side
   * guess. It renders only when BOTH are true:
   *   1. record.status === "valid"   (revoked/expired/pending never get it)
   *   2. record.certificateImage is present on the registry record fetched
   *      from data/certificates.json
   * That second condition is deliberate: the public verification page does
   * not serve a downloadable certificate image by default (see README,
   * "Privacy"). A record only gets a preview + seal if an administrator
   * explicitly opted that specific certificate into having one by adding
   * a certificateImage path — never automatically for every certificate.
   */
  function renderCertificatePreview(record) {
    if (record.status !== "valid" || !record.certificateImage) return null;

    const wrap = document.createElement("div");
    wrap.className = "cert-preview";
    wrap.appendChild(el("h3", null, ["Certificate Preview"]));

    const frame = document.createElement("div");
    frame.className = "cert-preview__frame cert-preview__frame--sealed";

    const img = document.createElement("img");
    img.src = record.certificateImage;
    img.alt = `Laleh Academy certificate issued to ${record.recipient} — ${record.certificate}`;
    img.loading = "lazy";
    frame.appendChild(img);

    const seal = document.createElement("div");
    seal.className = "verify-seal";
    seal.setAttribute("role", "img");
    seal.setAttribute("aria-label", "Laleh Academy verified seal — this certificate matches the official registry");
    seal.innerHTML = `
      <svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <path id="sealArcTop" d="M 22 70 A 48 48 0 0 1 118 70" />
        </defs>
        <circle cx="70" cy="70" r="66" fill="#031861" opacity="0.94"/>
        <circle cx="70" cy="70" r="66" fill="none" stroke="#F7C41D" stroke-width="2.5"/>
        <circle cx="70" cy="70" r="56" fill="none" stroke="#F7C41D" stroke-width="1" opacity="0.6"/>
        <path d="M50 71 L64 85 L92 55" fill="none" stroke="#F7C41D" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
        <text font-family="Inter, sans-serif" font-size="9.5" font-weight="700" letter-spacing="1.5" fill="#FFFFFF">
          <textPath href="#sealArcTop" startOffset="50%" text-anchor="middle">LALEH ACADEMY</textPath>
        </text>
        <text x="70" y="108" font-family="Inter, sans-serif" font-size="12" font-weight="700" letter-spacing="2" fill="#F7C41D" text-anchor="middle">VERIFIED</text>
      </svg>`;
    frame.appendChild(seal);

    wrap.appendChild(frame);
    wrap.appendChild(el("p", { style: "font-size:0.82rem; color:var(--ink-soft); margin: 10px 0 0;" }, [
      "This seal confirms the certificate above matches the Laleh Academy official registry at the time of verification. It is applied by this page and is not part of the original certificate file.",
    ]));
    return wrap;
  }

  function renderValidLike(record) {
    root.innerHTML = "";
    const content = STATUS_CONTENT[record.status];

    const band = el("div", { class: `status-band status-band--${content.cls}`, role: "status", "aria-live": "polite" }, [
      wrapSVG(SEALS[content.seal]),
      el("h2", null, [content.heading]),
      el("p", null, [content.body]),
      record.statusNote ? el("p", { style: "margin-top:10px; font-size:0.85rem;" }, [record.statusNote]) : null,
      el("span", { class: "status-tag" }, [content.tag]),
    ]);
    root.appendChild(band);

    const preview = renderCertificatePreview(record);
    if (preview) root.appendChild(preview);

    const card = document.createElement("div");
    card.className = "cred-card";

    const header = el("div", { class: "cred-card__header" }, [
      el("h3", null, ["Certificate Information"]),
      el("span", { class: "cred-card__id" }, [record.id]),
    ]);
    card.appendChild(header);

    if (record.sample) {
      const flagWrap = el("div", { style: "padding: 14px 22px 0;" }, [
        el("span", { class: "sample-flag" }, ["Sample / demo record"]),
      ]);
      card.appendChild(flagWrap);
    }

    const dl = document.createElement("dl");
    dl.className = "cred-grid";
    [
      credItem("Recipient", record.recipient, { full: true }),
      credItem("Certificate", record.certificate, { full: true }),
      record.title ? credItem("Title", record.title) : null,
      credItem("Issuer", record.issuer),
      credItem("Issue Date", LalehUtils.formatDate(record.issueDate)),
      record.completionDate ? credItem("Completion Date", LalehUtils.formatDate(record.completionDate)) : null,
      record.duration ? credItem("Duration", record.duration) : null,
      record.instructor ? credItem("Instructor", record.instructor) : null,
      record.department ? credItem("Department", record.department) : null,
      credItem("Status", content.tag),
    ].forEach((node) => { if (node) dl.appendChild(node); });
    card.appendChild(dl);
    root.appendChild(card);

    const meta = el("div", { class: "verify-meta" }, [
      el("div", null, [document.createTextNode("Verified by "), el("strong", null, ["Laleh Academy"]), document.createTextNode(" · Official Certificate Registry")]),
      el("div", null, [`Certificate ID: ${record.id} · Checked ${statusDate()}`]),
    ]);
    root.appendChild(meta);

    root.appendChild(searchAgainBlock());
  }

  async function main() {
    renderLoading();

    const rawId = LalehUtils.extractCertificateId();
    if (!rawId) {
      renderNotFound(null);
      return;
    }

    const normalized = LalehUtils.normalizeId(rawId);
    if (!normalized) {
      renderInvalidId(rawId);
      return;
    }

    let registry;
    try {
      registry = await LalehUtils.loadRegistry();
    } catch (e) {
      renderError();
      return;
    }

    const record = registry.get(normalized);
    if (!record) {
      renderNotFound(normalized);
      return;
    }

    if (!LalehUtils.isWellFormedRecord(record)) {
      renderMalformed(normalized);
      return;
    }

    if (!STATUS_CONTENT[record.status]) {
      renderMalformed(normalized);
      return;
    }

    document.title = `${record.status === "valid" ? "Verified" : STATUS_CONTENT[record.status].tag} — ${normalized} — Laleh Academy`;
    renderValidLike(record);
  }

  main();
})();
