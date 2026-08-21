# Laleh Academy — Certificate Authentication & Verification System

A static, GitHub Pages–hosted system for issuing certificate IDs, generating QR codes,
and letting anyone verify a Laleh Academy certificate by scanning it or entering its ID.

**Status of this build:** the certificate artwork here is a **placeholder** drawn in
Laleh Academy's brand colors — no real certificate template was supplied. Everything
else (verification portal, registry, QR system, generator, ID scheme, security model)
is complete and ready to use. Swapping in the real template is a single, well-scoped
change — see [Updating the certificate template](#updating-the-certificate-template).

---

## 1. What this project does

1. An administrator fills in a recipient's details in the **Certificate Generator** (`/generator/`).
2. The generator creates a unique **Certificate ID** (`LA-YYYY-XXXXXX`), a **QR code**
   pointing at that certificate's verification URL, and a downloadable certificate image.
3. It also produces a **registry entry** (JSON) that the administrator commits into
   `data/certificates.json`.
4. Anyone who scans the QR code, or types the certificate ID into the homepage, lands on
   `/verify/?id=LA-2026-000184` and sees whether the certificate is **valid, revoked,
   expired, pending**, or **not found**, along with its details.

There is no server, no database, and no login. The certificate registry is a JSON file
in the repository, and the "database" is Git history.

---

## 2. Architecture

```
/
├── index.html                 Homepage — explains the service, ID search
├── verify/index.html          Canonical verification page (?id=LA-2026-000184)
├── certificates/index.html    /certificates/ with no ID → redirects to /verify/
├── 404.html                   Rewrites /certificates/LA-2026-000184 → /verify/?id=...
├── data/
│   └── certificates.json      The certificate registry (source of truth)
├── assets/
│   ├── logo/logo.svg          Brand mark
│   └── certificate/           Real certificate template goes here
├── css/style.css              All styling (design tokens at the top)
├── js/
│   ├── utils.js                Shared helpers: ID validation, escaping, date formatting
│   ├── verify.js                Verification page controller / state rendering / seal
│   ├── templates.js             Certificate template registry (multiple certificate types)
│   ├── generator.js             Single-certificate admin generator logic
│   ├── bulk.js                  Bulk CSV generation: parse, validate, generate, ZIP export
│   ├── qr-editor.js             Drag/resize QR positioning editor
│   ├── auth.js                  Admin session gate (password check, session expiry)
│   └── auth-config.js           Admin password hash + session timeout config
├── generator/index.html       Password-gated admin dashboard (single / bulk / QR settings)
└── .nojekyll                  Disables Jekyll processing on GitHub Pages
```

### Why this structure

- **Everything the browser needs is static** (HTML/CSS/JS + one JSON file), so it works
  on GitHub Pages with zero build step and zero server.
- **`data/certificates.json` is the single source of truth.** The verification page
  never hardcodes certificate data — it fetches and looks up the registry, so it scales
  from 10 to 10,000+ certificates without touching any HTML.
- **`verify/` is canonical; `certificates/<id>` is a convenience alias** rewritten by
  `404.html`. GitHub Pages has no server-side router, so a "pretty" path like
  `/certificates/LA-2026-000184` doesn't correspond to a real file. GitHub Pages'
  standard workaround is to let it 404, then have `404.html` read the intended path
  from `location.pathname` and redirect client-side to the route the app actually
  understands. This is the same technique used by the well-known `spa-github-pages`
  project, and — unlike hash-routing or history-API tricks — it works identically
  in local testing and after deployment, and it works with JavaScript's real
  `location.pathname`, not a bolted-on hash fragment.
- **`generator/` is separate from the public site** conceptually (it's an admin tool),
  but is not access-controlled, because a static site cannot enforce access control —
  see [Security model](#6-security-model).
- **`js/templates.js` is a registry, not a single hardcoded layout.** Each certificate
  type (Completion, Achievement, Attendance, ...) owns its own drawing code, QR
  position, and default title. The generator asks whichever template is selected to
  draw itself — it has no per-type logic of its own. Adding a new certificate type
  means adding one object to this file; nothing else changes. See
  [Certificate types / templates](#4-certificate-types--templates).

---

## 3. Certificate data format

`data/certificates.json`:

```json
{
  "schemaVersion": 1,
  "issuer": "Laleh Academy",
  "generatedAt": "2026-08-20T00:00:00Z",
  "certificates": [
    {
      "id": "LA-2026-000184",
      "recipient": "Ahmed Karim Jassim",
      "certificate": "Petroleum Engineering Training Program",
      "title": "Certificate of Completion",
      "issuer": "Laleh Academy",
      "issueDate": "2026-08-15",
      "completionDate": "2026-08-14",
      "duration": "40 hours",
      "instructor": "Eng. Sarah Al-Hassan",
      "department": "Engineering & Technical Training",
      "status": "valid",
      "verificationUrl": "https://lalehacademy.github.io/certificates/LA-2026-000184",
      "sample": true
    }
  ]
}
```

**Required fields:** `id`, `recipient`, `certificate`, `issuer`, `issueDate`, `status`.
Everything else (`completionDate`, `duration`, `instructor`, `department`, `title`,
`statusNote`, `templateId`) is optional and simply omitted from display when absent.
`templateId` records which certificate design (see [§4](#4-certificate-types--templates))
was used, for administrative reference — the public verification page doesn't show it.

`status` must be one of: `valid`, `revoked`, `expired`, `pending`. Any other value, or a
record missing a required field, is treated as **malformed** and shown as a safe error
rather than crashing or displaying partial/garbled data.

Six sample records ship in the registry today, covering: a standard valid certificate,
a revoked certificate, a valid certificate with all optional fields, an Arabic
recipient name with a long course title, an expired certificate, and a pending
certificate. All are flagged `"sample": true`, which the verification page renders as a
visible **"Sample / demo record"** badge so they're never mistaken for real credentials.
Delete them before going live.

---

## 4. Certificate types / templates

Laleh Academy issues more than one kind of certificate, so the visual design isn't
hardcoded — it's a **registry of templates** in `js/templates.js`. This build ships
three:

| Template ID   | Name                          | Typical use                                  | QR position    |
|---------------|-------------------------------|-----------------------------------------------|-----------------|
| `completion`  | Certificate of Completion     | Standard course/program completion            | bottom-right    |
| `achievement` | Certificate of Achievement    | Distinction / merit-based recognition          | bottom-left     |
| `attendance`  | Certificate of Attendance     | Short workshops, seminars, events              | top-right       |

Each is visually distinct (border style, layout, accent emphasis) rather than a
recolored copy of the others, and each defines its **own** QR placement — a compact
attendance certificate and a full-page achievement award don't share layout geometry,
so forcing one QR position across every template would look wrong on at least one.

**In the generator** (`/generator/`), the admin picks a **Certificate type** dropdown at
the top of the form. That selection:
- Chooses which template's `draw()` function renders the canvas preview and PNG
- Auto-fills the "Certificate title" field with that template's default title (e.g.
  picking Achievement fills in "Certificate of Achievement") — still freely editable
- Is recorded on the record as `templateId` when you export the registry entry, so if
  you ever need to regenerate that exact certificate later, you know which layout to
  use again

**In the registry** (`data/certificates.json`), `templateId` is an optional field kept
for this provenance/regeneration purpose. The public verification page does not display
it — it's an administrative detail, not something a verifier needs to see.

### Adding a new certificate type
Open `js/templates.js` and add one object to the `TEMPLATES` array:

```js
const myNewTemplate = {
  id: "workshop-premium",                 // used as the <option value> and templateId
  name: "Premium Workshop Certificate",   // shown in the generator dropdown
  description: "For paid, multi-day workshops.",
  defaultTitle: "Certificate of Completion — Premium Workshop",
  qrPosition: { x: 78, y: 74, width: 16, height: 20, idAlign: "right" }, // % of canvas
  draw(ctx, canvas, record, qrImage) {
    // draw your layout here, then finish with:
    // LalehTemplates.drawQr(ctx, canvas, this.qrPosition, qrImage, record);
    // if (record.sample) LalehTemplates.sampleWatermark(ctx, canvas);
  },
};

const TEMPLATES = [completion, achievement, attendance, myNewTemplate];
```

Nothing in `generator.js` or `generator/index.html` needs to change — the dropdown and
the draw call are both driven by this array. `wrapText()`, `metaRows()`, `drawQr()`, and
`sampleWatermark()` are exposed on `LalehTemplates` for reuse across templates so you're
not rewriting text-wrapping or QR-compositing logic for every new design.

### Using a real certificate image instead of a code-drawn design
Every template currently draws its layout with Canvas shape/text commands (a stand-in,
since no real artwork was supplied). To use an actual template image instead:

1. Export the artwork at 300 DPI. For the 11×8.5in landscape canvas this generator
   uses, that's 3300×2550px (already the default `<canvas>` size).
2. Save it under `assets/certificate/`, e.g. `assets/certificate/completion.png`.
3. In that template's `draw()` function, replace the shape-drawing code with:
   ```js
   draw(ctx, canvas, record, qrImage) {
     const bg = new Image();
     bg.src = "/assets/certificate/completion.png";
     bg.onload = () => {
       ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);
       // overlay recipient name / program / dates at the coordinates that
       // match this template's blank fields, then:
       LalehTemplates.drawQr(ctx, canvas, this.qrPosition, qrImage, record);
     };
   },
   ```
4. Update the text coordinates and `qrPosition` to match where the real artwork has
   blank space for each field and for the QR code.

Do this per template — each certificate type can have its own real artwork, or share
one image with different overlay text, depending on what Laleh Academy actually uses.

---

## 5. Certificate IDs

**Format:** `LA-YYYY-XXXXXX` — issuing year plus a 6-digit number, e.g. `LA-2026-000184`.

**Uniqueness strategy:** the generator picks a **random** 6-digit number rather than an
incrementing counter, for two reasons:

1. *Unpredictability.* A sequential ID (`...000001`, `...000002`, ...) lets anyone
   enumerate every certificate Laleh Academy has ever issued just by incrementing the
   URL — turning a verification tool into a directory of recipients. Random IDs prevent
   that.
2. *No shared counter to coordinate.* Multiple people can generate certificates
   independently without needing to synchronize "the next number."

Collisions are checked against `data/certificates.json` before the entry is committed —
the administrator merging the PR/commit should confirm the new ID isn't already present
(with ~900,000 possible IDs per year and a registry that fits in one JSON file, this is
a quick visual/`grep` check, not a real bottleneck). If this system grows large enough
that manual collision checking becomes impractical, add a small pre-commit script or
GitHub Action that rejects a commit containing a duplicate `id`.

---

## 6. Security model

**Be precise about what this system actually proves.** A static GitHub Pages site
cannot authenticate anyone, hold secrets, or prevent someone from copying the HTML and
publishing an imitation.

**What the QR code is — and isn't:**
> The QR code is *not* proof of authenticity. It's a pointer to Laleh Academy's official
> certificate verification registry. Authenticity comes from that registry containing a
> matching record — not from the QR code itself, which could in principle be printed on
> a forged document too.

This is why the verification page always re-fetches the live registry rather than
trusting anything encoded in the URL beyond the certificate ID.

**What GitHub Pages cannot do:**
- No server-side authentication, sessions, or access control. Anyone can view
  `generator/index.html` and generate a certificate-shaped PNG and a JSON snippet — but
  that snippet has no effect until a human with write access to the repository commits
  it. **The registry, not the generator, is the source of truth.**
- No secrets. There is no API key, token, or credential anywhere in this codebase, and
  none should ever be added to client-side JS — anything shipped to the browser is
  public, full stop.
- No server-side write access. The generator cannot and does not push to GitHub. See
  [Certificate generation workflow](#7-certificate-generation-workflow).

**What this system does to reduce risk within those constraints:**
- Certificate IDs are random, not sequential (see above), to avoid making the registry
  a browsable directory of every recipient.
- All registry data is rendered with `textContent`/DOM APIs, never `innerHTML` with
  unescaped input — see [XSS prevention](#xss--input-handling) below.
- The certificate ID from the URL is validated against a strict pattern
  (`^LA-(20\d{2})-(\d{6})$`) before it's ever used as a lookup key or displayed. Anything
  that doesn't match is treated as "not found," not passed through.
- HTTPS is enforced automatically by GitHub Pages (`github.io` and custom domains with
  "Enforce HTTPS" enabled).
- Revocation is supported (`status: "revoked"`) so a compromised or mistakenly-issued
  certificate can be marked invalid without deleting its record — recipients and
  verifiers get an honest "revoked" state instead of "not found."
- Repository write access should be limited to trusted Laleh Academy administrators via
  normal GitHub repository permissions (Settings → Collaborators, or a GitHub team with
  branch protection on `main`). This is standard GitHub access control, not something
  this codebase implements itself.

### XSS / input handling
Every value that comes from the registry JSON or the URL query string is inserted via
`document.createTextNode` / `element.textContent` (see `js/verify.js`), never via
`innerHTML` string concatenation. The only `innerHTML` usage in the codebase is for
fixed, developer-authored SVG icon markup that contains no user-controlled data. This
means a malicious `recipient` or `certificate` string in the JSON (or a script tag
pasted into the URL) is rendered as inert text, not executed.

---

## 7. Certificate generation workflow

**What's automated:**
1. Random, collision-checked-at-a-glance ID generation
2. Verification URL construction
3. QR code generation (client-side, `qrcodejs`, high error correction)
4. Compositing the QR code onto the certificate artwork at a configurable position
5. Producing a downloadable certificate PNG
6. Producing a ready-to-paste JSON registry entry

**What's deliberately *not* automated**, and why:
- **Committing the registry entry to GitHub.** A static site has no server component
  that could hold a GitHub token safely — any token embedded in client-side JS would be
  visible to every visitor and could be used to write to the repository. So the last
  step is manual: copy the JSON from the generator, paste it into the `certificates`
  array in `data/certificates.json`, and commit (directly, or via a pull request if you
  want a review step). This also gives a human a final chance to catch a typo before a
  certificate becomes "official."

**The practical workflow:**
```
Admin fills in the generator form
        │
        ▼
Generator produces: certificate.png + QR code + JSON entry
        │
        ▼
Admin downloads certificate.png (send/print to recipient)
        │
        ▼
Admin pastes JSON entry into data/certificates.json, commits, pushes
        │
        ▼
GitHub Pages redeploys (usually within ~1 minute)
        │
        ▼
QR code / certificate ID now resolves on the live verification page
```

If Laleh Academy later wants one-click publishing, the natural evolution is a small
GitHub Action triggered by a `workflow_dispatch` or an authenticated form submission
(e.g. via GitHub's REST API from a lightweight serverless function you control) — that
requires a server-side component and is out of scope for a pure GitHub Pages site. See
[Future scalability](#10-future-scalability).

---

## 8. Admin dashboard: bulk generation, verification seal, QR editor, password protection

The admin tool at `/generator/` is now a small dashboard with three tabs, sitting
behind a password gate. Public verification (`/`, `/verify/`, `/certificates/...`)
is completely unaffected and stays open with no login.

### 8.1 Password protection

**Read this before relying on it.** A static site cannot hold a real secret — anyone
can view every file GitHub Pages serves, including the JavaScript that checks the
password. This gate is a **deterrent against accidental/casual access**, not
authentication in the sense a login-walled application has it. The actual control
over who can issue real certificates remains what it always was: **GitHub repository
permissions on who can commit to `data/certificates.json`.**

What it does do, within that honest limit:
- The password is never stored in source as plain text (`js/auth-config.js` holds a
  SHA-256 **hash**, not the password itself) — see that file for exactly how to change
  it (one line, one browser-console command, no build step).
- A successful login sets a timestamped flag in `sessionStorage` (not the password) —
  cleared automatically when the tab/browser closes, and expired after 30 minutes of
  inactivity (configurable in `js/auth-config.js`).
- A **Log Out** button in the dashboard header clears the session immediately.
- Direct navigation to `/generator/` always shows the password screen first — nothing
  about it is exposed via routing or hidden pages, though as with anything client-side,
  the *code* for the gate itself is visible to anyone who looks, by definition of how
  static hosting works.

If Laleh Academy later needs real access control (e.g., different staff with different
permissions, an audit log of who issued what), that requires a server component — see
[Future scalability](#11-future-scalability).

### 8.2 Bulk certificate generation (CSV)

In the **Bulk Generation** tab:
1. Upload a `.csv` with at minimum `recipient`, `certificate`, `issueDate` columns
   (column names are matched flexibly — `name`/`recipientname` are also recognized for
   `recipient`, for example). Optional columns: `completionDate`, `duration`,
   `instructor`, `department`, `title`.
2. Nothing is generated yet — you see a **preview table** with a Ready/Error status per
   row and specific messages (`Row 14: Missing required field: recipient`, `Row 27:
   Invalid date format: 2026/99/40`) for anything that won't pass.
3. Pick a certificate type and click **Generate N Certificates**. Only rows marked
   Ready are generated; errored rows are skipped, not silently dropped — they're listed
   again in the final summary.
4. A progress bar tracks generation (`31 / 50 completed`) since drawing dozens of
   full-resolution certificates and generating QR codes takes a moment; the UI yields
   periodically so the tab doesn't freeze.
5. You get a downloaded **ZIP** (`Laleh-Academy-Certificates/`) containing:
   - `certificates/<id>.png` — one per successful row
   - `qr-codes/<id>-qr.png` — the QR code alone, in case you need it separately
   - `registry/certificates.csv` — flat administrative record of what was generated
   - `registry/certificates-registry-snippet.json` — the exact array to paste into
     `data/certificates.json`
6. The same JSON snippet is also shown on-page so you can copy it without unzipping.

**IDs never collide with existing or in-batch certificates:** before generating, the
tool re-fetches the live `data/certificates.json` and only allocates a random ID that
isn't already present there or already used earlier in this batch (see [§5](#5-certificate-ids)
for why IDs are random rather than sequential).

**On PDF vs. PNG:** the brief's example output structure shows `.pdf` files; this
implementation exports `.png` instead. Reliable client-side PDF generation needs an
additional library and buys nothing for image-based certificates — a 300 DPI PNG
prints identically to a PDF wrapping the same image, and skipping the extra dependency
keeps the tool simpler and more reliable in-browser. If you specifically need `.pdf`
files, convert the PNGs afterward with any standard tool (they're print-resolution
already).

**CSV export safety:** cells in the exported CSV that start with `=`, `+`, `-`, or `@`
are prefixed with a leading quote before being written. Spreadsheet applications treat
a leading character like that as the start of a formula, and a certificate/recipient
field containing one (accidentally or maliciously) could otherwise execute when someone
opens the export in Excel/Sheets — this is the standard mitigation for that class of
issue ("CSV/formula injection").

### 8.3 Verification seal

A **Laleh Academy VERIFIED seal** now overlays the certificate preview on the public
verification page, but only under two conditions, both required:
1. `record.status === "valid"` — revoked, expired, pending, and not-found never show it.
2. The registry record includes a `certificateImage` field.

That second condition matters: the public verification page still does **not** show a
certificate image for every certificate by default (see [§9 Privacy](#9-privacy) —
that decision from the original build stands). A preview + seal only appear for a
certificate an administrator has explicitly opted in by adding a `certificateImage`
path pointing at a stored image (e.g. `/assets/certificate/issued/LA-2026-000184.png`).
One sample record (`LA-2026-000184`) ships with this enabled so you can see it live.

The seal is drawn by the verification page itself (`js/verify.js` +
`.verify-seal` in `css/style.css`) as a positioned overlay — **it is never baked into
the certificate file**, is sized responsively (smaller on narrow phone screens so it
doesn't dominate a small preview), and its presence is driven entirely by the fetched
registry record, never by a URL parameter — there is no way to make the seal appear on
an invalid or revoked certificate by crafting a link.

### 8.4 QR positioning editor

In the **Template / QR Settings** tab, pick a certificate type and drag the gold box
directly on the live preview to reposition the QR code; drag the small circular handle
at its corner to resize. Numeric X/Y/Width/Height (%) fields stay in sync for precise
adjustment, and an optional **snap to whole percentage points** toggle is available for
grid-like placement without forcing it.

The editor flags placement issues as you drag:
- QR too small for reliable printing (under roughly 0.7in on the physical certificate)
- QR extending outside the certificate boundary
- Insufficient quiet-zone margin near the edge
- QR sitting over a dark or visually busy area of the template (checked by sampling
  the actual rendered pixels under the box)

None of these block you from proceeding — they're warnings, not hard stops, since a
human may have context the heuristic doesn't (e.g., a template with a deliberately
plain corner that just happens to read as "busy" by the brightness heuristic).

**Persistence:** clicking **Save** stores the position in `localStorage`, scoped to
that template, purely as a browser-local convenience so you don't lose work-in-progress
on reload — it is **not** shared to other admins or committed anywhere automatically
(the same reasoning as everywhere else in this project: a static site can't write to
itself). To make a position permanent, copy the JSON shown under the preview and paste
it into that template's `qrPosition` object in `js/templates.js`, then commit. Once
committed, that position is what every future single or bulk generation uses for that
template automatically.

---

## 9. Privacy

The registry only stores what's needed to verify a certificate: recipient name,
program/certificate name, dates, duration, instructor/department, status, and ID. It
never stores phone numbers, email addresses, home addresses, national ID numbers, or
any other private contact/identity information — don't add these fields.

**On the certificate preview/download question (spec §14):** the public verification
page shows certificate *data* (a text summary) for every valid certificate, but a full
certificate **image preview** (with the verification seal, [§8.3](#83-verification-seal))
only appears for records that explicitly opt in via a `certificateImage` field — it is
not shown for every certificate by default. Reasoning: a downloadable image is easy to
screenshot/redistribute regardless, but *serving* one from every verification page by
default invites treating the portal as a document host rather than a verification tool,
and creates an incentive to store every issued certificate image in the public repo
indefinitely (increasing what's exposed if any single certificate needs to be
reconsidered). Opting a specific certificate in is a deliberate per-record choice: add
the image under `assets/certificate/issued/<id>.png` and reference it via
`certificateImage` in that record — as done for the `LA-2026-000184` sample.

---

## 10. Deployment

### Create and configure the repository
1. Create a new **public** GitHub repository (private repos need GitHub Pro/Team/Enterprise for Pages).
   - If the repo is named `lalehacademy.github.io` (a *user/org* page), the site is served at
     the root: `https://lalehacademy.github.io/`. This matches every URL used throughout
     this codebase and is the recommended setup.
   - If you use a different repo name (a *project* page), the site is served at
     `https://<user>.github.io/<repo>/` instead, and every absolute path in this project
     (`/css/style.css`, `/data/certificates.json`, etc.) needs a `/<repo>` prefix, or you
     should switch them to relative paths. Prefer the user/org page approach to avoid this.
2. Push this project's files to the repository's default branch (`main`).
3. In the repo: **Settings → Pages → Build and deployment → Source: "Deploy from a branch"**,
   branch `main`, folder `/ (root)`. Save.
4. Wait ~1 minute, then open the URL GitHub shows under Settings → Pages.
5. Under **Settings → Pages**, enable **Enforce HTTPS** once available.

### Test the verification flow
- `https://lalehacademy.github.io/` — homepage loads, search box works.
- `https://lalehacademy.github.io/verify/?id=LA-2026-000184` — shows the valid sample certificate.
- `https://lalehacademy.github.io/certificates/LA-2026-000184` — redirects to the line above.
- `https://lalehacademy.github.io/verify/?id=LA-2026-000002` — shows **revoked**.
- `https://lalehacademy.github.io/verify/?id=LA-9999-999999` — shows **not found**.
- `https://lalehacademy.github.io/generator/` — shows the password screen; wrong
  password shows an error, correct password opens the dashboard.
- Refresh the generator page while logged in — session should persist (until timeout).
- Click **Log Out** — should return to the password screen immediately.
- Bulk Generation tab: upload a small CSV (a few rows, one with a missing recipient and
  one with a bad date) and confirm the preview correctly marks Ready vs. Error rows,
  then generate and confirm the downloaded ZIP contains matching certificates/QR codes.
- Template / QR Settings tab: drag the QR box, resize it, confirm the numeric fields and
  warnings update, and that Reset restores the template's committed position.
- On the verification page, confirm `LA-2026-000184` shows a certificate preview with
  the VERIFIED seal, and that `LA-2026-000002` (revoked) shows no seal.

### Adding / updating / revoking certificates
1. Open `/generator/` and fill in the certificate details, or hand-write a JSON object
   following the schema in [§3](#3-certificate-data-format).
2. Add the object to the `certificates` array in `data/certificates.json`.
3. To **revoke**: find the existing record by `id` and change `"status"` to `"revoked"`
   (optionally add a human-readable `"statusNote"`). Don't delete the record — deleting
   it makes the certificate look "not found" instead of honestly "revoked."
4. Commit and push. GitHub Pages redeploys automatically.

### Deployment checklist
- [ ] Repository is public, Pages is enabled, HTTPS enforced
- [ ] Real certificate template installed (see below) and generator updated to use it
- [ ] Sample/demo records removed or clearly still marked `"sample": true`
- [ ] `data/certificates.json` validated (valid JSON — a linter or `python -m json.tool` catches typos)
- [ ] Verification tested for: valid, revoked, expired, pending, not-found, malformed record
- [ ] QR code from a real generated certificate scanned on an actual phone
- [ ] Mobile layout checked on a real device (not just a resized desktop browser)
- [ ] Repository collaborators limited to trusted Laleh Academy staff

---

## 11. Future scalability

The current design is deliberately simple, but each of these is a natural extension
that doesn't require re-architecting the core:

- **Admin dashboard** — a view over `data/certificates.json` with search/filter (still static; just more JS).
- **Automated commits** — a small serverless function (or GitHub Action) that accepts an
  authenticated request from the generator and opens a commit/PR automatically.
- **Bulk issuance** — CSV import into the generator, looping the same single-record logic.
- **Digital signatures** — sign each registry record (e.g. Ed25519) at generation time
  and verify the signature client-side, so a tampered *copy* of the registry can be
  detected even if someone hosts it elsewhere.
- **Multiple programs/templates** — key the template image per certificate `type` field.
- **Full Arabic/RTL UI** — `dir="rtl"` styles already exist in `css/style.css`; add an
  `/ar/` mirror of each page and Arabic copy.
- **Expiration automation** — compute `expired` from an `expiryDate` field at render
  time instead of requiring a manual status change.
- **Custom domain** — add a `CNAME` file and configure DNS; no code changes needed since
  the codebase already assumes the site lives at its own root.

---

## 12. Known limitations (be upfront about these)

- This is **verification against a registry**, not cryptographic proof. Anyone with
  repository write access can add or edit a record. Access control is GitHub's
  repository permissions, not something in this codebase.
- The generator's ID-collision check is visual/manual, not enforced by tooling — fine
  at current scale, worth automating past a few hundred certificates a year.
- No automated tests are included. Before relying on this in production, at minimum
  validate `data/certificates.json` (see checklist) after every edit.
