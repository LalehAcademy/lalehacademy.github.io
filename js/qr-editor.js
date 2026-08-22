/*
 * Laleh Academy — QR positioning editor
 *
 * Lets an admin drag/resize a QR box over a live template preview and
 * read off precise percentage coordinates. It does NOT rewrite
 * js/templates.js on its own — GitHub Pages has no server component that
 * could safely do that. Instead it produces the exact object to paste
 * into that template's `qrPosition` in js/templates.js, and remembers
 * the last position you tried (per template) in localStorage purely as a
 * browser-local convenience so reloading the editor doesn't lose your
 * work-in-progress.
 */

const LalehQrEditor = (() => {
  const PREVIEW_W = 1100, PREVIEW_H = 850; // smaller canvas for a responsive preview
  const LS_PREFIX = "laleh_qr_position_override:";

  let canvas, ctx, box, dragArea;
  let qrPreviewImg = null;
  let current = { x: 78, y: 74, width: 16, height: 20 };
  let dragMode = null; // "move" | "resize" | null
  let dragStart = null;

  function pctToPx(pct, dim) { return (pct / 100) * dim; }
  function pxToPct(px, dim) { return (px / dim) * 100; }

  function sampleRegion(x, y, w, h) {
    // Reads pixel data from the region BEHIND where the QR sits (the
    // template background at that spot) to flag busy/dark placement.
    const px = Math.round(pctToPx(x, canvas.width));
    const py = Math.round(pctToPx(y, canvas.height));
    const pw = Math.max(1, Math.round(pctToPx(w, canvas.width)));
    const ph = Math.max(1, Math.round(pctToPx(h, canvas.height)));
    const cx = Math.max(0, Math.min(px, canvas.width - 1));
    const cy = Math.max(0, Math.min(py, canvas.height - 1));
    const cw = Math.max(1, Math.min(pw, canvas.width - cx));
    const ch = Math.max(1, Math.min(ph, canvas.height - cy));
    try {
      const data = ctx.getImageData(cx, cy, cw, ch).data;
      let sum = 0, sumSq = 0, n = 0;
      for (let i = 0; i < data.length; i += 4) {
        const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        sum += lum; sumSq += lum * lum; n++;
      }
      const mean = sum / n;
      const variance = sumSq / n - mean * mean;
      return { mean, std: Math.sqrt(Math.max(0, variance)) };
    } catch (e) {
      return { mean: 255, std: 0 }; // canvas tainted or unreadable — skip the check
    }
  }

  function computeWarnings(pos) {
    const warnings = [];
    const widthIn = (pos.width / 100) * 11; // canvas represents an 11in-wide certificate
    const heightIn = (pos.height / 100) * 8.5;

    if (widthIn < 0.7 || heightIn < 0.7) {
      warnings.push("QR code may be too small for reliable printing — aim for at least 0.7–1 inch square at normal certificate size.");
    }
    if (pos.x < 0 || pos.y < 0 || pos.x + pos.width > 100 || pos.y + pos.height > 100) {
      warnings.push("QR code extends outside the certificate boundary — it will be clipped when printed.");
    }
    const margin = 2; // % of canvas, as a rough quiet-zone proxy
    if (pos.x < margin || pos.y < margin || (pos.x + pos.width) > (100 - margin)) {
      warnings.push("Leave a little more space between the QR code and the certificate's edge for a safe quiet zone.");
    }

    const bg = sampleRegion(pos.x, pos.y, pos.width, pos.height);
    if (bg.mean < 90) {
      warnings.push("QR is sitting over a dark area of the template — low contrast may prevent scanning.");
    }
    if (bg.std > 55) {
      warnings.push("QR is sitting over a visually busy/detailed area of the template — consider a plainer spot for reliable scanning.");
    }
    return warnings;
  }

  function renderWarnings() {
    const list = document.getElementById("qrWarnings");
    list.innerHTML = "";
    const warnings = computeWarnings(current);
    if (warnings.length === 0) {
      list.innerHTML = `<li class="qr-warning qr-warning--ok">✓ No issues detected with this placement.</li>`;
      return;
    }
    warnings.forEach((w) => {
      const li = document.createElement("li");
      li.className = "qr-warning";
      li.textContent = "⚠ " + w;
      list.appendChild(li);
    });
  }

  function syncBoxFromCurrent() {
    box.style.left = current.x + "%";
    box.style.top = current.y + "%";
    box.style.width = current.width + "%";
    box.style.height = current.height + "%";
    document.getElementById("qrX").value = current.x.toFixed(1);
    document.getElementById("qrY").value = current.y.toFixed(1);
    document.getElementById("qrW").value = current.width.toFixed(1);
    document.getElementById("qrH").value = current.height.toFixed(1);
    renderWarnings();
    updateOutput();
  }

  function clampPosition() {
    current.width = Math.max(3, Math.min(current.width, 60));
    current.height = Math.max(3, Math.min(current.height, 60));
    current.x = Math.max(-10, Math.min(current.x, 110 - current.width));
    current.y = Math.max(-10, Math.min(current.y, 110 - current.height));
  }

  function maybeSnap(val) {
    const snap = document.getElementById("snapToggle").checked;
    return snap ? Math.round(val) : Math.round(val * 10) / 10;
  }

  function drawPreview() {
    const templateId = document.getElementById("qrTemplateSelect").value;
    const template = LalehTemplates.get(templateId);
    const sampleRecord = {
      id: "LA-2026-000000",
      recipient: "Sample Recipient Name",
      certificate: "Sample Certificate Program",
      title: template.defaultTitle,
      issueDate: "2026-08-20",
      completionDate: "2026-08-19",
      duration: "40 hours",
      instructor: "Sample Instructor",
      sample: true,
    };
    // Draw without the template's own QR compositing (qrImage undefined
    // draws the background/text only) — the editor draws its own
    // draggable box + a representative QR image on top instead.
    template.draw(ctx, canvas, sampleRecord, null);
    if (qrPreviewImg) {
      const x = pctToPx(current.x, canvas.width);
      const y = pctToPx(current.y, canvas.height);
      const w = pctToPx(current.width, canvas.width);
      const h = pctToPx(current.height, canvas.height) * 0.72;
      ctx.drawImage(qrPreviewImg, x, y, w, h);
    }
    renderWarnings();
  }

  function updateOutput() {
    const templateId = document.getElementById("qrTemplateSelect").value;
    const out = {
      templateId,
      qr: {
        x: Math.round(current.x * 10) / 10,
        y: Math.round(current.y * 10) / 10,
        width: Math.round(current.width * 10) / 10,
        height: Math.round(current.height * 10) / 10,
      },
    };
    document.getElementById("qrOutput").value = JSON.stringify(out, null, 2);
  }

  function loadForTemplate(templateId) {
    const template = LalehTemplates.get(templateId);
    let stored = null;
    try {
      const raw = localStorage.getItem(LS_PREFIX + templateId);
      if (raw) stored = JSON.parse(raw);
    } catch (e) { /* ignore */ }
    current = stored || {
      x: template.qrPosition.x,
      y: template.qrPosition.y,
      width: template.qrPosition.width,
      height: template.qrPosition.height,
    };
    drawPreview();
    syncBoxFromCurrent();
  }

  function pointerPct(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: pxToPct(clientX - rect.left, rect.width),
      y: pxToPct(clientY - rect.top, rect.height),
    };
  }

  function bindDrag() {
    box.addEventListener("mousedown", (e) => startDrag(e, "move"));
    box.addEventListener("touchstart", (e) => startDrag(e, "move"), { passive: true });
    const handle = box.querySelector(".qr-resize-handle");
    handle.addEventListener("mousedown", (e) => { e.stopPropagation(); startDrag(e, "resize"); });
    handle.addEventListener("touchstart", (e) => { e.stopPropagation(); startDrag(e, "resize"); }, { passive: true });

    function startDrag(e, mode) {
      dragMode = mode;
      dragStart = { pointer: pointerPct(e), pos: { ...current } };
    }

    function onMove(e) {
      if (!dragMode) return;
      const p = pointerPct(e);
      const dx = maybeSnap(p.x - dragStart.pointer.x);
      const dy = maybeSnap(p.y - dragStart.pointer.y);
      if (dragMode === "move") {
        current.x = dragStart.pos.x + dx;
        current.y = dragStart.pos.y + dy;
      } else if (dragMode === "resize") {
        current.width = dragStart.pos.width + dx;
        current.height = dragStart.pos.height + dy;
      }
      clampPosition();
      drawPreview();
      syncBoxFromCurrent();
    }

    function onUp() { dragMode = null; }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchend", onUp);
  }

  function bindInputs() {
    ["qrX", "qrY", "qrW", "qrH"].forEach((id) => {
      document.getElementById(id).addEventListener("change", (e) => {
        const map = { qrX: "x", qrY: "y", qrW: "width", qrH: "height" };
        current[map[id]] = parseFloat(e.target.value) || 0;
        clampPosition();
        drawPreview();
        syncBoxFromCurrent();
      });
    });

    document.getElementById("qrResetBtn").addEventListener("click", () => {
      const templateId = document.getElementById("qrTemplateSelect").value;
      const template = LalehTemplates.get(templateId);
      current = { ...template.qrPosition };
      drawPreview();
      syncBoxFromCurrent();
    });

    document.getElementById("qrSaveBtn").addEventListener("click", () => {
      const templateId = document.getElementById("qrTemplateSelect").value;
      localStorage.setItem(LS_PREFIX + templateId, JSON.stringify(current));
      const status = document.getElementById("qrSaveStatus");
      status.textContent = "Saved in this browser. Copy the JSON below into js/templates.js and commit it to make this permanent.";
      setTimeout(() => { status.textContent = ""; }, 6000);
    });

    document.getElementById("qrTemplateSelect").addEventListener("change", (e) => loadForTemplate(e.target.value));
  }

  function populateTemplateSelect() {
    const select = document.getElementById("qrTemplateSelect");
    select.innerHTML = "";
    LalehTemplates.TEMPLATES.forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.name;
      select.appendChild(opt);
    });
  }

  function init() {
    canvas = document.getElementById("qrEditorCanvas");
    ctx = canvas.getContext("2d");
    canvas.width = PREVIEW_W;
    canvas.height = PREVIEW_H;
    box = document.getElementById("qrDragBox");
    dragArea = document.getElementById("qrDragArea");

    populateTemplateSelect();

    // Generate one representative QR image to preview with, pointing at a
    // harmless placeholder — its content doesn't matter for a layout tool.
    const hidden = document.createElement("div");
    hidden.style.position = "absolute";
    hidden.style.left = "-9999px";
    document.body.appendChild(hidden);
    new QRCode(hidden, { text: "https://lalehacademy.github.io/certificates/LA-2026-000000", width: 256, height: 256, correctLevel: QRCode.CorrectLevel.H });
    requestAnimationFrame(() => {
      const qrCanvas = hidden.querySelector("canvas");
      qrPreviewImg = new Image();
      qrPreviewImg.onload = () => drawPreview();
      qrPreviewImg.src = qrCanvas.toDataURL("image/png");
    });

    bindDrag();
    bindInputs();
    loadForTemplate(document.getElementById("qrTemplateSelect").value);
  }

  return { init };
})();
