/* Stationery Queue — shared helpers (ES module). */

export const cfg = () => window.SQ || {};

export function isConfigured() {
  const c = cfg();
  return !!(
    c.SUPABASE_URL &&
    c.SUPABASE_ANON_KEY &&
    !c.SUPABASE_URL.includes("YOUR-PROJECT") &&
    !c.SUPABASE_ANON_KEY.includes("YOUR-ANON")
  );
}

export function isDemo() {
  return new URLSearchParams(location.search).get("demo") === "1";
}

let _client = null;
export async function getClient() {
  if (_client) return _client;
  const { createClient } = await import(
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm"
  );
  const c = cfg();
  _client = createClient(c.SUPABASE_URL, c.SUPABASE_ANON_KEY);
  return _client;
}

export const todayISO = () => new Date().toISOString().slice(0, 10);

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[m]);
}

export function fmtBytes(n) {
  if (!n && n !== 0) return "";
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + " KB";
  return (n / 1024 / 1024).toFixed(1) + " MB";
}

export function timeAgo(iso) {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return s + "s ago";
  const m = Math.round(s / 60);
  if (m < 60) return m + "m ago";
  return Math.round(m / 60) + "h ago";
}

export function settingsLine(s) {
  const parts = [];
  parts.push(s.color ? "Colour" : "B&W");
  parts.push((s.copies || 1) + (s.copies === 1 ? " copy" : " copies"));
  parts.push(s.pages && s.pages !== "all" ? "pp. " + s.pages : "All pages");
  if (s.double_sided) parts.push("Double-sided");
  return parts.join(" · ");
}

export function shortFileName(path) {
  const base = String(path).split("/").pop() || path;
  return base.replace(/^[0-9a-f-]{36}_/, "");
}

/* Two-tone counter chime (WebAudio, no audio file needed). */
export function chime() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    [523.25, 783.99].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      const t = ctx.currentTime + i * 0.22;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.55);
    });
  } catch (_) { /* audio unavailable — stay silent */ }
}

export async function sha256hex(str) {
  if (crypto?.subtle) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  return "plain:" + str; // non-secure context fallback (local file preview)
}

/* Sample data for ?demo=1 previews — clearly labeled, never sent anywhere. */
export function demoQueue() {
  const now = Date.now();
  const mk = (token_number, customer_name, file_name, size, settings, status, minsAgo) => ({
    id: "demo-" + token_number,
    queue_date: todayISO(),
    token_number,
    customer_name,
    phone_number: "",
    file_name,
    file_url: "",
    file_size_bytes: size,
    print_settings: settings,
    status,
    created_at: new Date(now - minsAgo * 60000).toISOString(),
  });
  return [
    mk(14, "Aarav Mehta", "physics-notes-ch3.pdf", 2400000,
      { color: false, copies: 2, pages: "all", double_sided: true, note: "" }, "waiting", 4),
    mk(15, "Sana Sheikh", "resume-final.pdf", 380000,
      { color: true, copies: 1, pages: "all", double_sided: false, note: "Glossy if available" }, "waiting", 9),
    mk(16, "Rohit Kumar", "admit-card.jpg", 890000,
      { color: true, copies: 1, pages: "all", double_sided: false, note: "" }, "waiting", 12),
    mk(13, "Priya Nair", "project-report.pdf", 5100000,
      { color: false, copies: 1, pages: "1-12", double_sided: false, note: "Spiral binding" }, "printing", 22),
    mk(12, "Kabir Anand", "form-16.pdf", 410000,
      { color: false, copies: 3, pages: "all", double_sided: false, note: "" }, "completed", 35),
    mk(11, "Ishita Rao", "poster-a3.png", 3200000,
      { color: true, copies: 1, pages: "all", double_sided: false, note: "" }, "completed", 51),
  ];
}
