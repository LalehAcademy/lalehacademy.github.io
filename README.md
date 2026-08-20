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
│   ├── verify.js                Verification page controller / state rendering
│   └── generator.js             Admin certificate + QR generator logic
├── generator/index.html       Admin tool (client-side only)
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
  see [Security model](#5-security-model).

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
`statusNote`) is optional and simply omitted from display when absent.

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

## 4. Certificate IDs

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

## 5. Security model

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
  [Certificate generation workflow](#6-certificate-generation-workflow).

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

## 6. Certificate generation workflow

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
[Future scalability](#9-future-scalability).

---

## 7. Privacy

The registry only stores what's needed to verify a certificate: recipient name,
program/certificate name, dates, duration, instructor/department, status, and ID. It
never stores phone numbers, email addresses, home addresses, national ID numbers, or
any other private contact/identity information — don't add these fields.

**On the certificate preview/download question (spec §14):** the public verification
page in this build shows certificate *data* (a text summary) but does **not** offer a
downloadable image of the certificate itself from the public page. Reasoning: a
downloadable image is easy to screenshot/redistribute regardless, but *serving* one
directly from the verification page invites treating the portal as a document host
rather than a verification tool, and creates an incentive to store every issued
certificate image in the public repo indefinitely (increasing what's exposed if any
single certificate needs to be reconsidered). If Laleh Academy wants this feature,
the cleanest approach is: store issued images under `assets/certificate/issued/<id>.png`,
add a `certificateImage` field to that record, and have the verification page render
an `<img>`/"Download" link only when that field is present — opt-in per record, not
a blanket default.

---

## 8. Deployment

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
- `https://lalehacademy.github.io/generator/` — the admin tool loads and can generate a PNG + JSON.
- Scan a generated QR code with a phone camera and confirm it opens the correct page.

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

## Updating the certificate template

The real certificate artwork should replace the placeholder drawing in
`js/generator.js` (`drawCertificate()`). Recommended approach:

1. Place the template image at `assets/certificate/template.png` (export at 300 DPI —
   for an 11×8.5in landscape certificate that's 3300×2550px, which is what the canvas
   in `generator/index.html` is already sized for).
2. In `drawCertificate()`, replace the placeholder shape-drawing code with:
   ```js
   const bg = new Image();
   bg.src = "/assets/certificate/template.png";
   bg.onload = () => {
     ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);
     // ...then draw recipient name / program / dates / QR at the coordinates
     //    that match the real template's blank fields.
   };
   ```
3. Update the text coordinates (currently hand-placed for the placeholder design) and
   `QR_POSITION` in `js/generator.js` to match where your template has blank space and
   the QR code should sit. `QR_POSITION` is percentage-based (`{x, y, width, height}` as
   % of canvas size) specifically so it stays correct regardless of final resolution.

---

## 9. Future scalability

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

## 10. Known limitations (be upfront about these)

- This is **verification against a registry**, not cryptographic proof. Anyone with
  repository write access can add or edit a record. Access control is GitHub's
  repository permissions, not something in this codebase.
- The generator's ID-collision check is visual/manual, not enforced by tooling — fine
  at current scale, worth automating past a few hundred certificates a year.
- No automated tests are included. Before relying on this in production, at minimum
  validate `data/certificates.json` (see checklist) after every edit.
