/*
 * Laleh Academy — certificate generator (admin tool)
 *
 * Runs entirely client-side. Produces:
 *   1. A downloadable certificate PNG (with QR code composited on)
 *   2. A JSON registry entry to be committed into data/certificates.json
 *
 * It does NOT write to GitHub. There is no safe way for a static GitHub
 * Pages site to hold a credential capable of pushing commits without
 * exposing that credential to every visitor's browser — so the last step
 * (getting the entry into the registry) is intentionally left to a human
 * with repository access. See README "Certificate generation workflow".
 */

// ---- QR placement on the certificate, as % of canvas width/height ----
// Matches the coordinate system requested in the brief: percentage-based,
// so it stays correct regardless of final output resolution.
const QR_POSITION = { x: 78, y: 74, width: 16, height: 20 }; // includes label space

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

/* ---------------- Certificate drawing (placeholder design) ----------------
 * This is a stand-in visual so the full pipeline (ID -> QR -> composite ->
 * download -> registry entry) can be demonstrated end to end. Swap this
 * function out for one that drawImage()s Laleh Academy's real certificate
 * template once it's supplied, then overlay the same text + QR logic on
 * top of it at the coordinates that match that artwork.
 * ------------------------------------------------------------------------- */
function drawCertificate(record, qrImage) {
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  // Paper
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, W, H);

  // Outer blue border
  ctx.strokeStyle = "#071f71";
  ctx.lineWidth = 10;
  ctx.strokeRect(40, 40, W - 80, H - 80);

  // Gold inner rule
  ctx.strokeStyle = "#F7C41D";
  ctx.lineWidth = 3;
  ctx.strokeRect(64, 64, W - 128, H - 128);

  // Top ribbon gradient
  const grad = ctx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, "#1b3db3");
  grad.addColorStop(0.55, "#071f71");
  grad.addColorStop(1, "#031861");
  ctx.fillStyle = grad;
  ctx.fillRect(64, 64, W - 128, 190);

  // Academy name
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "center";
  ctx.font = "600 64px Fraunces, Georgia, serif";
  ctx.fillText("LALEH ACADEMY", W / 2, 175);
  ctx.font = "500 26px Inter, sans-serif";
  ctx.fillStyle = "#F7C41D";
  ctx.fillText("OFFICIAL CERTIFICATE OF TRAINING", W / 2, 220);

  // Certificate title
  ctx.fillStyle = "#031861";
  ctx.font = "600 58px Fraunces, Georgia, serif";
  ctx.fillText(record.title || "Certificate of Completion", W / 2, 400);

  ctx.font = "400 30px Inter, sans-serif";
  ctx.fillStyle = "#4A4F6A";
  ctx.fillText("This certifies that", W / 2, 470);

  // Recipient name
  ctx.font = "600 72px Fraunces, Georgia, serif";
  ctx.fillStyle = "#0B1230";
  ctx.fillText(record.recipient, W / 2, 570);

  // Underline
  ctx.strokeStyle = "#F7C41D";
  ctx.lineWidth = 3;
  const nameWidth = Math.min(ctx.measureText(record.recipient).width + 80, W - 400);
  ctx.beginPath();
  ctx.moveTo(W / 2 - nameWidth / 2, 600);
  ctx.lineTo(W / 2 + nameWidth / 2, 600);
  ctx.stroke();

  ctx.font = "400 30px Inter, sans-serif";
  ctx.fillStyle = "#4A4F6A";
  ctx.fillText("has successfully completed", W / 2, 660);

  ctx.font = "600 44px Fraunces, Georgia, serif";
  ctx.fillStyle = "#031861";
  wrapText(ctx, record.certificate, W / 2, 730, W - 500, 56);

  // Meta row (issue date / duration / instructor)
  ctx.font = "400 24px Inter, sans-serif";
  ctx.fillStyle = "#4A4F6A";
  ctx.textAlign = "left";
  let metaY = H - 420;
  const metaX = 220;
  const lineGap = 42;
  const rows = [
    ["Issue date", LalehUtils.formatDate(record.issueDate) || record.issueDate],
    record.completionDate ? ["Completion date", LalehUtils.formatDate(record.completionDate) || record.completionDate] : null,
    record.duration ? ["Duration", record.duration] : null,
    record.instructor ? ["Instructor", record.instructor] : null,
    record.department ? ["Department", record.department] : null,
  ].filter(Boolean);
  rows.forEach(([label, value]) => {
    ctx.fillStyle = "#8B90AC";
    ctx.font = "700 18px Inter, sans-serif";
    ctx.fillText(label.toUpperCase(), metaX, metaY);
    ctx.fillStyle = "#0B1230";
    ctx.font = "500 26px Inter, sans-serif";
    ctx.fillText(value, metaX, metaY + 30);
    metaY += lineGap + 34;
  });

  // Signature line
  ctx.strokeStyle = "#C7CCE3";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(metaX, H - 200);
  ctx.lineTo(metaX + 420, H - 200);
  ctx.stroke();
  ctx.font = "500 22px Inter, sans-serif";
  ctx.fillStyle = "#4A4F6A";
  ctx.fillText("Authorized Signature — Laleh Academy", metaX, H - 170);

  // Certificate ID (bottom, near QR)
  ctx.textAlign = "right";
  ctx.font = "600 26px 'JetBrains Mono', monospace";
  ctx.fillStyle = "#031861";
  const qrPxX = (QR_POSITION.x / 100) * W;
  const qrPxY = (QR_POSITION.y / 100) * H;
  const qrPxW = (QR_POSITION.width / 100) * W;
  ctx.fillText(record.id, qrPxX + qrPxW, qrPxY - 20);

  // QR code
  if (qrImage) {
    const qrPxH = (QR_POSITION.height / 100) * H * 0.72; // reserve room for caption
    ctx.drawImage(qrImage, qrPxX, qrPxY, qrPxW, qrPxH);
    ctx.textAlign = "center";
    ctx.font = "500 18px Inter, sans-serif";
    ctx.fillStyle = "#4A4F6A";
    ctx.fillText("Scan to verify", qrPxX + qrPxW / 2, qrPxY + qrPxH + 26);
  }

  // Sample watermark
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(-Math.PI / 10);
  ctx.font = "700 120px Inter, sans-serif";
  ctx.fillStyle = "rgba(3, 24, 97, 0.06)";
  ctx.textAlign = "center";
  ctx.fillText("SAMPLE", 0, 0);
  ctx.restore();
}

function wrapText(ctx2, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  let lines = [];
  for (const word of words) {
    const test = line ? line + " " + word : word;
    if (ctx2.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  lines.push(line);
  ctx2.textAlign = "center";
  const startY = y - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((l, i) => ctx2.fillText(l, x, startY + i * lineHeight));
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
  return {
    id,
    recipient: document.getElementById("recipient").value.trim(),
    certificate: document.getElementById("program").value.trim(),
    title: document.getElementById("certType").value.trim() || "Certificate of Completion",
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

  const { img, dataUrl } = await generateQr(record.verificationUrl);
  currentQrDataUrl = dataUrl;
  drawCertificate(record, img);

  document.getElementById("jsonOut").value = toRegistryJson(record);
  document.getElementById("downloadPng").disabled = false;
  document.getElementById("downloadQr").disabled = false;
}

document.getElementById("genForm").addEventListener("submit", handleSubmit);
document.getElementById("regenId").addEventListener("click", refreshId);

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
document.getElementById("issueDate").valueAsDate = new Date();
refreshId();
