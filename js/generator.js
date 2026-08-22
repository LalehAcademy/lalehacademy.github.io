/*
 * Laleh Academy — certificate generator (admin tool)
 *
 * Runs entirely client-side. Produces:
 *   1. A downloadable certificate PNG (with QR code composited on),
 *      drawn using whichever template the admin selects
 *   2. A JSON registry entry to be committed into data/certificates.json
 *
 * It does NOT write to GitHub. There is no safe way for a static GitHub
 * Pages site to hold a credential capable of pushing commits without
 * exposing that credential to every visitor's browser — so the last step
 * (getting the entry into the registry) is intentionally left to a human
 * with repository access. See README "Certificate generation workflow".
 *
 * Multiple certificate types: see js/templates.js. This file doesn't know
 * about any individual template's layout — it just asks the selected
 * template to draw itself. Adding a new certificate type never requires
 * editing this file.
 */

const canvas = document.getElementById("certCanvas");
const ctx = canvas.getContext("2d");
const qrHidden = document.createElement("div");
qrHidden.style.position = "absolute";
qrHidden.style.left = "-9999px";
document.body.appendChild(qrHidden);

let currentRecord = null;
let currentQrDataUrl = null;

function pad(n) { return String(n).padStart(6, "0"); }

function generateId(year) {
  const suffix = Math.floor(Math.random() * 900000) + 100000; // 6 digits, non-sequential
  return `LA-${year}-${pad(suffix).slice(-6)}`;
}

function refreshId() {
  const year = new Date().getFullYear();
  document.getElementById("certId").value = generateId(year);
}

function populateTemplateSelect() {
  const select = document.getElementById("templateId");
  select.innerHTML = "";
  LalehTemplates.TEMPLATES.forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.name;
    select.appendChild(opt);
  });
}

function onTemplateChange() {
  const template = LalehTemplates.get(document.getElementById("templateId").value);
  const titleField = document.getElementById("certType");
  const desc = document.getElementById("templateDesc");
  // Only auto-fill the title if the admin hasn't customized it away from
  // another template's default — avoids clobbering a deliberate edit.
  const currentIsSomeDefault = LalehTemplates.TEMPLATES.some((t) => t.defaultTitle === titleField.value);
  if (!titleField.value || currentIsSomeDefault) {
    titleField.value = template.defaultTitle;
  }
  desc.textContent = template.description;
}

function generateQr(url) {
  return new Promise((resolve) => {
    qrHidden.innerHTML = "";
    new QRCode(qrHidden, {
      text: url,
      width: 512,
      height: 512,
      correctLevel: QRCode.CorrectLevel.H, // highest error correction — survives print wear
    });
    // qrcodejs draws synchronously to an internal <canvas>
    requestAnimationFrame(() => {
      const qrCanvas = qrHidden.querySelector("canvas");
      const img = new Image();
      img.onload = () => resolve({ img, dataUrl: img.src });
      img.src = qrCanvas.toDataURL("image/png");
    });
  });
}

function buildRecord() {
  const id = document.getElementById("certId").value.trim();
  const baseUrl = document.getElementById("baseUrl").value.trim().replace(/\/$/, "");
  const templateId = document.getElementById("templateId").value;
  return {
    id,
    templateId,
    recipient: document.getElementById("recipient").value.trim(),
    certificate: document.getElementById("program").value.trim(),
    title: document.getElementById("certType").value.trim() || LalehTemplates.get(templateId).defaultTitle,
    issuer: "Laleh Academy",
    issueDate: document.getElementById("issueDate").value,
    completionDate: document.getElementById("completionDate").value || undefined,
    duration: document.getElementById("duration").value.trim() || undefined,
    instructor: document.getElementById("instructor").value.trim() || undefined,
    department: document.getElementById("department").value.trim() || undefined,
    status: document.getElementById("status").value,
    verificationUrl: `${baseUrl}/certificates/${id}`,
  };
}

function toRegistryJson(record) {
  const clean = {};
  Object.entries(record).forEach(([k, v]) => { if (v !== undefined && v !== "") clean[k] = v; });
  return JSON.stringify(clean, null, 2);
}

async function handleSubmit(e) {
  e.preventDefault();
  const recipient = document.getElementById("recipient").value.trim();
  const program = document.getElementById("program").value.trim();
  const issueDate = document.getElementById("issueDate").value;
  if (!recipient || !program || !issueDate) {
    alert("Recipient, program, and issue date are required.");
    return;
  }

  const record = buildRecord();
  currentRecord = record;

  const template = LalehTemplates.get(record.templateId);
  const { img, dataUrl } = await generateQr(record.verificationUrl);
  currentQrDataUrl = dataUrl;
  template.draw(ctx, canvas, record, img);

  document.getElementById("jsonOut").value = toRegistryJson(record);
  document.getElementById("downloadPng").disabled = false;
  document.getElementById("downloadQr").disabled = false;
}

document.getElementById("genForm").addEventListener("submit", handleSubmit);
document.getElementById("regenId").addEventListener("click", refreshId);
document.getElementById("templateId").addEventListener("change", onTemplateChange);

document.getElementById("downloadPng").addEventListener("click", () => {
  if (!currentRecord) return;
  const a = document.createElement("a");
  a.download = `${currentRecord.id}.png`;
  a.href = canvas.toDataURL("image/png");
  a.click();
});

document.getElementById("downloadQr").addEventListener("click", () => {
  if (!currentQrDataUrl || !currentRecord) return;
  const a = document.createElement("a");
  a.download = `${currentRecord.id}-qr.png`;
  a.href = currentQrDataUrl;
  a.click();
});

document.getElementById("copyJson").addEventListener("click", () => {
  const ta = document.getElementById("jsonOut");
  ta.select();
  navigator.clipboard?.writeText(ta.value);
});

// Init
populateTemplateSelect();
onTemplateChange();
document.getElementById("issueDate").valueAsDate = new Date();
refreshId();
