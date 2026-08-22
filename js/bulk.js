/*
 * Laleh Academy — bulk certificate generation from CSV
 *
 * Flow: CSV upload -> parse -> validate -> preview (nothing generated yet)
 * -> admin clicks "Generate" -> IDs allocated + QR + certificate drawn per
 * valid row -> ZIP (certificates/, qr-codes/, registry/) + a pasteable
 * JSON snippet for data/certificates.json, exactly like the single-
 * certificate flow, just batched. No certificate is generated for a row
 * that failed validation, and generation never writes to GitHub itself —
 * see README "Certificate generation workflow".
 */

const LalehBulk = (() => {
  const REQUIRED_FIELDS = ["recipient", "certificate", "issueDate"];

  const HEADER_ALIASES = {
    recipient: ["recipient", "name", "recipientname", "student", "studentname"],
    certificate: ["certificate", "program", "course", "certificatename", "coursename"],
    issueDate: ["issuedate", "issue_date", "date"],
    completionDate: ["completiondate", "completion_date"],
    duration: ["duration", "hours"],
    instructor: ["instructor", "trainer"],
    department: ["department", "dept"],
    grade: ["grade", "score"],
    title: ["title", "certificatetitle"],
  };

  let parsedRows = [];   // [{ rowNum, fields: {...}, errors: [] }]
  let usedIds = new Set();
  let lastResult = null; // { successRecords, failedRows }

  // ---------------- CSV parsing (RFC4180-ish, no dependency) ----------------
  function parseCSVText(text) {
    const rows = [];
    let row = [], field = "", inQuotes = false;
    const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (inQuotes) {
        if (c === '"') {
          if (s[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else {
          field += c;
        }
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(field); field = "";
      } else if (c === "\n") {
        row.push(field); field = "";
        rows.push(row); row = [];
      } else {
        field += c;
      }
    }
    if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
    return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
  }

  function normalizeHeader(h) {
    return h.trim().toLowerCase().replace(/[\s_-]+/g, "");
  }

  function mapHeaders(headerRow) {
    const normalized = headerRow.map(normalizeHeader);
    const map = {}; // fieldKey -> column index
    Object.entries(HEADER_ALIASES).forEach(([field, aliases]) => {
      const idx = normalized.findIndex((h) => aliases.includes(h));
      if (idx !== -1) map[field] = idx;
    });
    const extraCols = [];
    normalized.forEach((h, idx) => {
      const isKnown = Object.values(map).includes(idx);
      if (!isKnown) extraCols.push({ idx, label: headerRow[idx].trim() });
    });
    return { map, extraCols };
  }

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  function isValidDate(str) {
    if (!DATE_RE.test(str)) return false;
    const [y, m, d] = str.split("-").map(Number);
    if (m < 1 || m > 12) return false;
    const daysInMonth = new Date(y, m, 0).getDate();
    return d >= 1 && d <= daysInMonth;
  }

  function validateRow(fields) {
    const errors = [];
    REQUIRED_FIELDS.forEach((f) => {
      if (!fields[f] || !String(fields[f]).trim()) {
        errors.push(`Missing required field: ${f}`);
      }
    });
    if (fields.issueDate && !isValidDate(fields.issueDate)) {
      errors.push(`Invalid date format: ${fields.issueDate} (expected YYYY-MM-DD)`);
    }
    if (fields.completionDate && !isValidDate(fields.completionDate)) {
      errors.push(`Invalid date format: ${fields.completionDate} (expected YYYY-MM-DD)`);
    }
    return errors;
  }

  function parseAndValidate(text) {
    const rows = parseCSVText(text);
    if (rows.length === 0) {
      return { error: "The CSV file appears to be empty.", rows: [] };
    }
    const { map, extraCols } = mapHeaders(rows[0]);
    const missingRequired = REQUIRED_FIELDS.filter((f) => !(f in map));
    if (missingRequired.length > 0) {
      return { error: `CSV is missing required column(s): ${missingRequired.join(", ")}`, rows: [] };
    }
    if (rows.length === 1) {
      return { error: "The CSV has a header row but no data rows.", rows: [] };
    }

    const dataRows = rows.slice(1);
    const parsed = dataRows.map((cells, i) => {
      const fields = {};
      Object.entries(map).forEach(([field, idx]) => { fields[field] = (cells[idx] || "").trim(); });
      const extra = {};
      extraCols.forEach(({ idx, label }) => {
        const v = (cells[idx] || "").trim();
        if (v) extra[label] = v;
      });
      const rowNum = i + 2; // account for header row + 1-indexing
      const errors = validateRow(fields);
      return { rowNum, fields, extra, errors };
    });
    return { error: null, rows: parsed };
  }

  // ---------------- Preview table ----------------
  function renderPreview(rows) {
    parsedRows = rows;
    const container = document.getElementById("bulkPreview");
    container.innerHTML = "";

    const validCount = rows.filter((r) => r.errors.length === 0).length;
    const summary = document.createElement("p");
    summary.style.fontSize = "0.88rem";
    summary.style.color = "var(--ink-soft)";
    summary.textContent = `${rows.length} row(s) parsed — ${validCount} ready, ${rows.length - validCount} with errors.`;
    container.appendChild(summary);

    const table = document.createElement("table");
    table.className = "bulk-table";
    table.innerHTML = `<thead><tr>
      <th>#</th><th>Recipient</th><th>Certificate</th><th>Issue Date</th><th>Status</th>
    </tr></thead>`;
    const tbody = document.createElement("tbody");
    rows.forEach((r) => {
      const tr = document.createElement("tr");
      const ok = r.errors.length === 0;
      tr.innerHTML = `
        <td>${r.rowNum - 1}</td>
        <td>${LalehUtils.escapeHTML(r.fields.recipient || "—")}</td>
        <td>${LalehUtils.escapeHTML(r.fields.certificate || "—")}</td>
        <td>${LalehUtils.escapeHTML(r.fields.issueDate || "—")}</td>
        <td>${ok ? '<span class="bulk-status bulk-status--ready">Ready</span>' : `<span class="bulk-status bulk-status--error" title="${LalehUtils.escapeHTML(r.errors.join('; '))}">Error</span>`}
      `;
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);

    const errorRows = rows.filter((r) => r.errors.length > 0);
    if (errorRows.length > 0) {
      const errBox = document.createElement("div");
      errBox.className = "bulk-errors";
      errBox.innerHTML = "<strong>Validation errors</strong>";
      const list = document.createElement("ul");
      errorRows.forEach((r) => {
        r.errors.forEach((e) => {
          const li = document.createElement("li");
          li.textContent = `Row ${r.rowNum - 1}: ${e}`;
          list.appendChild(li);
        });
      });
      errBox.appendChild(list);
      container.appendChild(errBox);
    }

    document.getElementById("bulkGenerateBtn").disabled = validCount === 0;
    document.getElementById("bulkGenerateBtn").textContent = `Generate ${validCount} Certificate${validCount === 1 ? "" : "s"}`;
    document.getElementById("bulkResult").innerHTML = "";
  }

  function handleFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const { error, rows } = parseAndValidate(String(reader.result));
      const errBanner = document.getElementById("bulkFileError");
      if (error) {
        errBanner.textContent = error;
        document.getElementById("bulkPreview").innerHTML = "";
        document.getElementById("bulkGenerateBtn").disabled = true;
        return;
      }
      errBanner.textContent = "";
      renderPreview(rows);
    };
    reader.onerror = () => {
      document.getElementById("bulkFileError").textContent = "Could not read that file. Please try again.";
    };
    reader.readAsText(file);
  }

  // ---------------- ID allocation ----------------
  function pad(n) { return String(n).padStart(6, "0"); }
  function randomId(year) {
    const suffix = Math.floor(Math.random() * 900000) + 100000;
    return `LA-${year}-${pad(suffix).slice(-6)}`;
  }
  function allocateId(year) {
    for (let attempt = 0; attempt < 30; attempt++) {
      const candidate = randomId(year);
      if (!usedIds.has(candidate)) {
        usedIds.add(candidate);
        return candidate;
      }
    }
    return null;
  }

  // ---------------- Generation ----------------
  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  function generateQr(canvasHost, url) {
    return new Promise((resolve) => {
      canvasHost.innerHTML = "";
      new QRCode(canvasHost, { text: url, width: 512, height: 512, correctLevel: QRCode.CorrectLevel.H });
      requestAnimationFrame(() => {
        const qrCanvas = canvasHost.querySelector("canvas");
        resolve(qrCanvas);
      });
    });
  }

  function csvSafeCell(value) {
    const str = String(value ?? "");
    if (/^[=+\-@]/.test(str)) return "'" + str;
    return str;
  }

  function toCSVRow(cells) {
    return cells.map((c) => {
      const safe = csvSafeCell(c);
      return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
    }).join(",");
  }

  async function runGeneration() {
    const validRows = parsedRows.filter((r) => r.errors.length === 0);
    if (validRows.length === 0) return;

    const templateId = document.getElementById("bulkTemplateSelect").value;
    const template = LalehTemplates.get(templateId);
    const baseUrl = document.getElementById("bulkBaseUrl").value.trim().replace(/\/$/, "");
    const status = document.getElementById("bulkStatus").value;
    const year = new Date().getFullYear();

    document.getElementById("bulkResult").innerHTML = "";
    try {
      const registry = await LalehUtils.loadRegistry();
      usedIds = new Set(registry.keys());
    } catch (e) {
      usedIds = new Set();
    }

    const progressWrap = document.getElementById("bulkProgress");
    const progressBar = document.getElementById("bulkProgressBar");
    const progressLabel = document.getElementById("bulkProgressLabel");
    progressWrap.style.display = "";
    document.getElementById("bulkGenerateBtn").disabled = true;

    const zip = new JSZip();
    const certFolder = zip.folder("Laleh-Academy-Certificates/certificates");
    const qrFolder = zip.folder("Laleh-Academy-Certificates/qr-codes");

    const qrHost = document.createElement("div");
    qrHost.style.position = "absolute";
    qrHost.style.left = "-9999px";
    document.body.appendChild(qrHost);

    const offCanvas = document.createElement("canvas");
    offCanvas.width = 3300;
    offCanvas.height = 2550;
    const offCtx = offCanvas.getContext("2d");

    const successRecords = [];
    const failedRows = [];

    for (let i = 0; i < validRows.length; i++) {
      const r = validRows[i];
      try {
        const id = allocateId(year);
        if (!id) throw new Error("Could not allocate a unique certificate ID");

        const record = {
          id,
          templateId,
          recipient: r.fields.recipient,
          certificate: r.fields.certificate,
          title: r.fields.title || template.defaultTitle,
          issuer: "Laleh Academy",
          issueDate: r.fields.issueDate,
          completionDate: r.fields.completionDate || undefined,
          duration: r.fields.duration || undefined,
          instructor: r.fields.instructor || undefined,
          department: r.fields.department || undefined,
          status,
          verificationUrl: `${baseUrl}/certificates/${id}`,
        };

        const qrCanvas = await generateQr(qrHost, record.verificationUrl);
        const qrImg = new Image();
        await new Promise((resolve) => { qrImg.onload = resolve; qrImg.src = qrCanvas.toDataURL("image/png"); });

        template.draw(offCtx, offCanvas, record, qrImg);
        const certBlob = await new Promise((resolve) => offCanvas.toBlob(resolve, "image/png"));
        const qrBlob = await new Promise((resolve) => qrCanvas.toBlob(resolve, "image/png"));

        certFolder.file(`${id}.png`, certBlob);
        qrFolder.file(`${id}-qr.png`, qrBlob);
        successRecords.push(record);
      } catch (err) {
        failedRows.push({ rowNum: r.rowNum - 1, reason: err.message || "Unknown error during generation" });
      }

      const done = i + 1;
      const pct = Math.round((done / validRows.length) * 100);
      progressBar.style.width = pct + "%";
      progressLabel.textContent = `Generating certificates… ${pct}% (${done} / ${validRows.length} completed)`;

      if (done % 5 === 0) await sleep(0);
    }

    parsedRows.filter((r) => r.errors.length > 0).forEach((r) => {
      failedRows.push({ rowNum: r.rowNum - 1, reason: r.errors.join("; ") });
    });
    failedRows.sort((a, b) => a.rowNum - b.rowNum);

    const csvHeader = ["certificateId", "recipient", "certificate", "issueDate", "completionDate", "duration", "instructor", "department", "templateId", "status", "verificationUrl"];
    const csvLines = [toCSVRow(csvHeader)];
    successRecords.forEach((rec) => {
      csvLines.push(toCSVRow(csvHeader.map((k) => rec[k] ?? "")));
    });
    zip.folder("Laleh-Academy-Certificates/registry").file("certificates.csv", csvLines.join("\n"));

    const jsonSnippet = JSON.stringify(successRecords.map((rec) => {
      const clean = {};
      Object.entries(rec).forEach(([k, v]) => { if (v !== undefined && v !== "") clean[k] = v; });
      return clean;
    }), null, 2);
    zip.folder("Laleh-Academy-Certificates/registry").file("certificates-registry-snippet.json", jsonSnippet);

    progressLabel.textContent = "Packaging ZIP file…";
    const blob = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `laleh-academy-certificates-${new Date().toISOString().slice(0, 10)}.zip`;
    a.click();

    progressWrap.style.display = "none";
    document.getElementById("bulkGenerateBtn").disabled = false;
    document.body.removeChild(qrHost);

    lastResult = { successRecords, failedRows };
    renderResult(lastResult, jsonSnippet);
  }

  function renderResult(result, jsonSnippet) {
    const { successRecords, failedRows } = result;
    const box = document.getElementById("bulkResult");
    const ids = successRecords.map((r) => r.id).sort();
    const idRange = ids.length > 0 ? `${ids[0]} → ${ids[ids.length - 1]}` : "—";

    box.innerHTML = "";
    const summary = document.createElement("div");
    summary.className = "bulk-summary" + (failedRows.length > 0 ? " bulk-summary--warn" : " bulk-summary--ok");
    summary.innerHTML = `
      <strong>${failedRows.length > 0 ? "Bulk generation completed with warnings" : "Bulk generation complete"}</strong>
      <div>Total records: ${successRecords.length + failedRows.length}</div>
      <div>Successfully generated: ${successRecords.length}</div>
      <div>Failed: ${failedRows.length}</div>
      <div>Certificate IDs: ${LalehUtils.escapeHTML(idRange)}</div>
    `;
    box.appendChild(summary);

    if (failedRows.length > 0) {
      const failBox = document.createElement("div");
      failBox.className = "bulk-errors";
      failBox.innerHTML = "<strong>Failed rows</strong>";
      const list = document.createElement("ul");
      failedRows.forEach((f) => {
        const li = document.createElement("li");
        li.textContent = `Row ${f.rowNum} — ${f.reason}`;
        list.appendChild(li);
      });
      failBox.appendChild(list);
      box.appendChild(failBox);
    }

    const jsonBox = document.createElement("div");
    jsonBox.style.marginTop = "14px";
    jsonBox.innerHTML = `<label style="display:block; font-size:0.8rem; font-weight:600; color:var(--ink-soft); margin-bottom:5px;">
      Registry entries (also included in the downloaded ZIP) — paste into the <code>certificates</code> array in <code>data/certificates.json</code></label>`;
    const ta = document.createElement("textarea");
    ta.className = "json-out";
    ta.readOnly = true;
    ta.value = jsonSnippet;
    jsonBox.appendChild(ta);
    box.appendChild(jsonBox);
  }

  function init() {
    const fileInput = document.getElementById("bulkCsvInput");
    fileInput.addEventListener("change", (e) => {
      if (e.target.files[0]) handleFile(e.target.files[0]);
    });
    document.getElementById("bulkGenerateBtn").addEventListener("click", runGeneration);
  }

  return { init };
})();
