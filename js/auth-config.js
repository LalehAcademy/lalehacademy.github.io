/*
 * Laleh Academy — admin password configuration
 *
 * IMPORTANT — read this before relying on it:
 * This is NOT real authentication. GitHub Pages is a static file host with
 * no server, so there is no way to keep a secret truly secret here: anyone
 * can view this file's contents, and a sufficiently determined visitor
 * could brute-force this hash offline or simply read js/auth.js and see
 * exactly how the check works. This gate exists to stop a casual visitor
 * or search-engine crawler from landing on the generator and issuing a
 * certificate by accident — it is a speed bump, not a lock. Real access
 * control (only trusted staff can issue certificates) is enforced the
 * same way it always is on this project: through GitHub repository
 * permissions on who can commit to data/certificates.json. See the
 * README's "Security model" and "Password protection" sections.
 *
 * WHY A HASH INSTEAD OF THE PLAIN PASSWORD:
 * Storing "const password = 'Laleh123'" means anyone who opens this file
 * reads the password directly. Storing a SHA-256 hash means they'd have
 * to guess a password that happens to hash to this exact value — not
 * meaningfully "secure" against a targeted attacker with this file in
 * hand, but it does mean the password isn't sitting here in plain text
 * for anyone glancing at the source, and it means the same password
 * can't be read off and reused elsewhere by someone skimming the repo.
 *
 * CHANGING THE PASSWORD:
 * Default password is: LalehAdmin2026!  — change it before real use.
 * Open a browser console (F12) anywhere and run:
 *
 *   crypto.subtle.digest("SHA-256", new TextEncoder().encode("your-new-password"))
 *     .then(buf => console.log([...new Uint8Array(buf)]
 *       .map(b => b.toString(16).padStart(2, "0")).join("")));
 *
 * Copy the printed hex string into ADMIN_PASSWORD_HASH below, commit, done.
 */

const LalehAuthConfig = {
  ADMIN_PASSWORD_HASH: "f35101d497a93b088162aae3d4f2fdcd14f6bf5efb9e3aba64be379dae6efde6",
  // How long a session stays valid with no activity, in minutes.
  SESSION_TIMEOUT_MINUTES: 30,
};
