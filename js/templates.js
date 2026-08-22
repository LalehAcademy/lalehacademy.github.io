/*
 * Laleh Academy — certificate template registry
 *
 * Each template is self-contained: it owns its own layout, QR placement,
 * and default title, and draws itself onto whatever canvas context it's
 * given. This is what makes "issue a Certificate of Achievement instead
 * of a Certificate of Completion" a matter of picking a different entry
 * here rather than branching logic scattered through the generator.
 *
 * Adding a new template = adding a new object to TEMPLATES. Nothing else
 * in the generator needs to change — the <select> in generator/index.html
 * is populated from this file automatically.
 *
 * To use a real certificate image instead of a code-drawn design, set
 * `backgroundImage` to an asset path; draw() will composite the recipient
 * text and QR code on top of it instead of drawing shapes. See the
 * "achievement" template below for a worked (currently placeholder)
 * example of the image-backed path, and "completion" / "attendance" for
 * the fully vector-drawn path.
 */

const LalehTemplates = (() => {

  function wrapText(ctx, text, x, y, maxWidth, lineHeight, align = "center") {
    const words = text.split(" ");
    let line = "";
    const lines = [];
    for (const word of words) {
      const test = line ? line + " " + word : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    lines.push(line);
    ctx.textAlign = align;
    const startY = y - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((l, i) => ctx.fillText(l, x, startY + i * lineHeight));
    return lines.length;
  }

  function metaRows(ctx, record, x, startY, lineGap = 42, blockGap = 34, color = "#4A4F6A", labelColor = "#8B90AC", valueColor = "#0B1230") {
    const rows = [
      ["Issue date", LalehUtils.formatDate(record.issueDate) || record.issueDate],
      record.completionDate ? ["Completion date", LalehUtils.formatDate(record.completionDate) || record.completionDate] : null,
      record.duration ? ["Duration", record.duration] : null,
      record.instructor ? ["Instructor", record.instructor] : null,
      record.department ? ["Department", record.department] : null,
    ].filter(Boolean);
    let y = startY;
    ctx.textAlign = "left";
    rows.forEach(([label, value]) => {
      ctx.fillStyle = labelColor;
      ctx.font = "700 18px Inter, sans-serif";
      ctx.fillText(label.toUpperCase(), x, y);
      ctx.fillStyle = valueColor;
      ctx.font = "500 26px Inter, sans-serif";
      ctx.fillText(value, x, y + 30);
      y += lineGap + blockGap;
    });
    return y;
  }

  function drawQr(ctx, canvas, qrPosition, qrImage, record, captionColor = "#4A4F6A", idColor = "#031861") {
    const W = canvas.width, H = canvas.height;
    const qrPxX = (qrPosition.x / 100) * W;
    const qrPxY = (qrPosition.y / 100) * H;
    const qrPxW = (qrPosition.width / 100) * W;
    const qrPxH = (qrPosition.height / 100) * H * 0.72;

    ctx.textAlign = qrPosition.idAlign || "right";
    ctx.font = "600 26px 'JetBrains Mono', monospace";
    ctx.fillStyle = idColor;
    const idX = qrPosition.idAlign === "left" ? qrPxX : qrPxX + qrPxW;
    ctx.fillText(record.id, idX, qrPxY - 20);

    if (qrImage) {
      ctx.drawImage(qrImage, qrPxX, qrPxY, qrPxW, qrPxH);
      ctx.textAlign = "center";
      ctx.font = "500 18px Inter, sans-serif";
      ctx.fillStyle = captionColor;
      ctx.fillText("Scan to verify", qrPxX + qrPxW / 2, qrPxY + qrPxH + 26);
    }
  }

  function sampleWatermark(ctx, canvas) {
    const W = canvas.width, H = canvas.height;
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-Math.PI / 10);
    ctx.font = "700 120px Inter, sans-serif";
    ctx.fillStyle = "rgba(3, 24, 97, 0.06)";
    ctx.textAlign = "center";
    ctx.fillText("SAMPLE", 0, 0);
    ctx.restore();
  }

  /* ---------------------------------------------------------------------
   * Template: Completion
   * Blue ribbon header, gold double border, QR bottom-right.
   * --------------------------------------------------------------------- */
  const completion = {
    id: "completion",
    name: "Certificate of Completion",
    description: "Standard course/program completion certificate.",
    defaultTitle: "Certificate of Completion",
    qrPosition: { x: 78, y: 74, width: 16, height: 20, idAlign: "right" },
    draw(ctx, canvas, record, qrImage) {
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, W, H);

      ctx.strokeStyle = "#071f71";
      ctx.lineWidth = 10;
      ctx.strokeRect(40, 40, W - 80, H - 80);
      ctx.strokeStyle = "#F7C41D";
      ctx.lineWidth = 3;
      ctx.strokeRect(64, 64, W - 128, H - 128);

      const grad = ctx.createLinearGradient(0, 0, W, 0);
      grad.addColorStop(0, "#1b3db3");
      grad.addColorStop(0.55, "#071f71");
      grad.addColorStop(1, "#031861");
      ctx.fillStyle = grad;
      ctx.fillRect(64, 64, W - 128, 190);

      ctx.fillStyle = "#FFFFFF";
      ctx.textAlign = "center";
      ctx.font = "600 64px Fraunces, Georgia, serif";
      ctx.fillText("LALEH ACADEMY", W / 2, 175);
      ctx.font = "500 26px Inter, sans-serif";
      ctx.fillStyle = "#F7C41D";
      ctx.fillText("OFFICIAL CERTIFICATE OF TRAINING", W / 2, 220);

      ctx.fillStyle = "#031861";
      ctx.font = "600 58px Fraunces, Georgia, serif";
      ctx.textAlign = "center";
      ctx.fillText(record.title || this.defaultTitle, W / 2, 400);

      ctx.font = "400 30px Inter, sans-serif";
      ctx.fillStyle = "#4A4F6A";
      ctx.fillText("This certifies that", W / 2, 470);

      ctx.font = "600 72px Fraunces, Georgia, serif";
      ctx.fillStyle = "#0B1230";
      ctx.fillText(record.recipient, W / 2, 570);

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

      metaRows(ctx, record, 220, H - 420);

      ctx.strokeStyle = "#C7CCE3";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(220, H - 200);
      ctx.lineTo(220 + 420, H - 200);
      ctx.stroke();
      ctx.font = "500 22px Inter, sans-serif";
      ctx.fillStyle = "#4A4F6A";
      ctx.textAlign = "left";
      ctx.fillText("Authorized Signature — Laleh Academy", 220, H - 170);

      drawQr(ctx, canvas, this.qrPosition, qrImage, record);
      if (record.sample) sampleWatermark(ctx, canvas);
    },
  };

  /* ---------------------------------------------------------------------
   * Template: Achievement
   * Gold-forward, ornate double rule, medallion seal, QR bottom-left.
   * Distinct visual identity for standout/merit-based awards.
   * --------------------------------------------------------------------- */
  const achievement = {
    id: "achievement",
    name: "Certificate of Achievement",
    description: "For distinction, top performance, or merit-based recognition.",
    defaultTitle: "Certificate of Achievement",
    qrPosition: { x: 8, y: 74, width: 16, height: 20, idAlign: "left" },
    draw(ctx, canvas, record, qrImage) {
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#FFFDF4";
      ctx.fillRect(0, 0, W, H);

      // Ornate gold double border
      ctx.strokeStyle = "#F7C41D";
      ctx.lineWidth = 14;
      ctx.strokeRect(36, 36, W - 72, H - 72);
      ctx.strokeStyle = "#031861";
      ctx.lineWidth = 3;
      ctx.strokeRect(66, 66, W - 132, H - 132);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(78, 78, W - 156, H - 156);

      // Medallion seal, top center
      const cx = W / 2, cy = 230, r = 90;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = "#031861";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, r - 14, 0, Math.PI * 2);
      ctx.strokeStyle = "#F7C41D";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = "#F7C41D";
      ctx.textAlign = "center";
      ctx.font = "600 30px Fraunces, Georgia, serif";
      ctx.fillText("LA", cx, cy + 12);
      ctx.font = "500 13px Inter, sans-serif";
      ctx.fillStyle = "#FFFFFF";
      ctx.fillText("LALEH ACADEMY", cx, cy + 40);

      ctx.fillStyle = "#031861";
      ctx.font = "600 30px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("LALEH ACADEMY — CERTIFICATE OF DISTINCTION", W / 2, 375);

      ctx.font = "600 60px Fraunces, Georgia, serif";
      ctx.fillStyle = "#7A5B00";
      ctx.fillText(record.title || this.defaultTitle, W / 2, 460);

      ctx.font = "400 28px Inter, sans-serif";
      ctx.fillStyle = "#4A4F6A";
      ctx.fillText("is proudly presented to", W / 2, 520);

      ctx.font = "600 74px Fraunces, Georgia, serif";
      ctx.fillStyle = "#0B1230";
      ctx.fillText(record.recipient, W / 2, 625);

      ctx.font = "400 28px Inter, sans-serif";
      ctx.fillStyle = "#4A4F6A";
      ctx.fillText("in recognition of outstanding performance in", W / 2, 685);

      ctx.font = "600 42px Fraunces, Georgia, serif";
      ctx.fillStyle = "#031861";
      wrapText(ctx, record.certificate, W / 2, 750, W - 560, 54);

      metaRows(ctx, record, W - 620, H - 420, 42, 34, "#4A4F6A", "#8B90AC", "#0B1230");

      ctx.strokeStyle = "#E3D28A";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(W - 620, H - 200);
      ctx.lineTo(W - 200, H - 200);
      ctx.stroke();
      ctx.font = "500 22px Inter, sans-serif";
      ctx.fillStyle = "#4A4F6A";
      ctx.textAlign = "left";
      ctx.fillText("Authorized Signature — Laleh Academy", W - 620, H - 170);

      drawQr(ctx, canvas, this.qrPosition, qrImage, record, "#4A4F6A", "#7A5B00");
      if (record.sample) sampleWatermark(ctx, canvas);
    },
  };

  /* ---------------------------------------------------------------------
   * Template: Attendance
   * Compact, minimal banner-style layout for short workshops/events.
   * QR top-right, smaller footprint, no meta-row block.
   * --------------------------------------------------------------------- */
  const attendance = {
    id: "attendance",
    name: "Certificate of Attendance",
    description: "For workshops, seminars, or short-form events.",
    defaultTitle: "Certificate of Attendance",
    qrPosition: { x: 78, y: 12, width: 13, height: 17, idAlign: "right" },
    draw(ctx, canvas, record, qrImage) {
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, W, H);

      // Thin single border, minimal
      ctx.strokeStyle = "#1b3db3";
      ctx.lineWidth = 4;
      ctx.strokeRect(50, 50, W - 100, H - 100);

      // Left accent bar
      const barW = 26;
      ctx.fillStyle = "#F7C41D";
      ctx.fillRect(50, 50, barW, H - 100);

      const leftPad = 50 + barW + 90;

      ctx.textAlign = "left";
      ctx.font = "500 22px Inter, sans-serif";
      ctx.fillStyle = "#8B90AC";
      ctx.fillText("LALEH ACADEMY", leftPad, 220);

      ctx.font = "600 52px Fraunces, Georgia, serif";
      ctx.fillStyle = "#031861";
      ctx.fillText(record.title || this.defaultTitle, leftPad, 300);

      ctx.font = "400 26px Inter, sans-serif";
      ctx.fillStyle = "#4A4F6A";
      ctx.fillText("Awarded to", leftPad, 400);

      ctx.font = "600 68px Fraunces, Georgia, serif";
      ctx.fillStyle = "#0B1230";
      ctx.fillText(record.recipient, leftPad, 480);

      ctx.font = "400 26px Inter, sans-serif";
      ctx.fillStyle = "#4A4F6A";
      ctx.fillText("for attending", leftPad, 560);

      ctx.font = "600 38px Fraunces, Georgia, serif";
      ctx.fillStyle = "#031861";
      ctx.textAlign = "left";
      wrapText(ctx, record.certificate, leftPad, 630, W - leftPad - 500, 48, "left");

      // Meta as a single inline row (compact template — fewer fields)
      ctx.font = "500 24px Inter, sans-serif";
      ctx.fillStyle = "#4A4F6A";
      const dateStr = LalehUtils.formatDate(record.issueDate) || record.issueDate;
      let metaLine = dateStr;
      if (record.duration) metaLine += `   ·   ${record.duration}`;
      if (record.instructor) metaLine += `   ·   ${record.instructor}`;
      ctx.fillText(metaLine, leftPad, H - 200);

      ctx.font = "600 26px 'JetBrains Mono', monospace";
      ctx.fillStyle = "#031861";
      ctx.fillText(record.id, leftPad, H - 150);

      drawQr(ctx, canvas, this.qrPosition, qrImage, record);
      if (record.sample) sampleWatermark(ctx, canvas);
    },
  };

  const TEMPLATES = [completion, achievement, attendance];

  function get(id) {
    return TEMPLATES.find((t) => t.id === id) || TEMPLATES[0];
  }

  return { TEMPLATES, get, wrapText, metaRows, drawQr, sampleWatermark };
})();
