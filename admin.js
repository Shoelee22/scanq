/* Stationery Queue — shop owner dashboard logic. */
import {
  cfg, isConfigured, isDemo, getClient, todayISO,
  esc, fmtBytes, settingsLine, shortFileName, chime, sha256hex, demoQueue,
} from "./sq.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const params = new URLSearchParams(location.search);
const BOARD = params.get("display") === "1";
const DEMO = isDemo();

const state = { rows: [], tab: "waiting", muted: false, sb: null };

const STATUS_LABEL = { waiting: "Waiting", printing: "Printing", completed: "Done", cancelled: "Cancelled" };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = cfg().SHOP_NAME || "Stationery Shop"));
$("#todayLine").textContent = new Date().toLocaleDateString("en-IN", {
  weekday: "long", day: "numeric", month: "long",
});
if (!isConfigured() && !DEMO) $$("[data-cfg-warn]").forEach((el) => (el.hidden = false));

/* ================================================================
   COUNTER DISPLAY BOARD (?display=1) — big tokens for a TV screen
   ================================================================ */
if (BOARD) {
  $("#view-board").hidden = false;
  document.title = "Now serving — " + (cfg().SHOP_NAME || "");
  boot(boardTick);
}

async function boardTick() {
  renderBoard();
  if (DEMO || !isConfigured()) return;
  state.sb = state.sb || (await getClient());
  state.sb
    .channel("board")
    .on("postgres_changes",
      { event: "*", schema: "public", table: "queue_items", filter: `queue_date=eq.${todayISO()}` },
      (p) => { applyChange(p); renderBoard(); })
    .subscribe();
}

function renderBoard() {
  const printing = state.rows.filter((r) => r.status === "printing").sort((a, b) => a.token_number - b.token_number);
  const waiting = state.rows.filter((r) => r.status === "waiting").sort((a, b) => a.token_number - b.token_number);
  const main = $("#boardMain"), next = $("#boardNext");
  if (printing.length) {
    const cur = printing[0];
    main.innerHTML = `<div class="k">NOW PRINTING</div><div class="n">${cur.token_number}</div>` +
      `<div class="who">${esc(cur.customer_name)}</div>`;
  } else if (waiting.length) {
    main.innerHTML = `<div class="k">NEXT UP</div><div class="n">${waiting[0].token_number}</div>` +
      `<div class="who">${esc(waiting[0].customer_name)}</div>`;
  } else {
    main.innerHTML = `<div class="k">${esc((cfg().SHOP_NAME || "").toUpperCase())}</div>` +
      `<div class="idle" style="margin-top:24px">No tokens in queue.<br />Scan the QR code at the counter to get one.</div>`;
  }
  const upcoming = waiting.slice(printing.length ? 0 : 1, (printing.length ? 0 : 1) + 3);
  next.innerHTML = upcoming.length
    ? "Up next: " + upcoming.map((r) => `<strong>${r.token_number}</strong>`).join(" · ")
    : "";
}

/* ================================================================
   DASHBOARD
   ================================================================ */
if (!BOARD) {
  if (DEMO || sessionStorage.getItem("sq_admin") === "1") showDash();
  else {
    $("#view-lock").hidden = false;
    $("#inPass").focus();
  }
  $("#btnUnlock").onclick = tryUnlock;
  $("#inPass").addEventListener("keydown", (e) => { if (e.key === "Enter") tryUnlock(); });
}

async function tryUnlock() {
  const v = $("#inPass").value.trim();
  if (!v) return;
  const h = await sha256hex(v);
  const want = cfg().ADMIN_PASSCODE_SHA256 || "";
  if (h === want || h === "plain:" + v && want === "plain:1234") {
    sessionStorage.setItem("sq_admin", "1");
    showDash();
  } else {
    $("#passErr").style.display = "block";
    $("#inPass").value = "";
    $("#inPass").focus();
  }
}

async function showDash() {
  $("#view-lock").hidden = true;
  $("#view-dash").hidden = false;
  bindDash();
  await boot(renderDash);
  if (DEMO) simulateArrival();
}

function bindDash() {
  $$(".tabs button").forEach((b) =>
    b.addEventListener("click", () => {
      state.tab = b.dataset.tab;
      $$(".tabs button").forEach((x) => x.setAttribute("aria-selected", x === b ? "true" : "false"));
      renderDash();
    }));
  $("#btnNext").onclick = callNext;
  $("#btnMute").onclick = () => {
    state.muted = !state.muted;
    $("#btnMute").textContent = state.muted ? "Sound off" : "Sound on";
    $("#btnMute").setAttribute("aria-pressed", String(!state.muted));
  };
  $("#queueList").addEventListener("click", onCardAction);
}

async function boot(after) {
  if (DEMO || !isConfigured()) {
    state.rows = demoQueue();
  } else {
    state.sb = await getClient();
    const { data, error } = await state.sb.from("queue_items")
      .select("*").eq("queue_date", todayISO())
      .order("token_number", { ascending: true });
    if (error) { toast("Could not load queue: " + error.message); return; }
    state.rows = data || [];
    state.sb
      .channel("queue")
      .on("postgres_changes",
        { event: "*", schema: "public", table: "queue_items", filter: `queue_date=eq.${todayISO()}` },
        (p) => {
          applyChange(p);
          if (p.eventType === "INSERT" && !state.muted) chime();
          if (BOARD) renderBoard(); else renderDash(p.eventType === "INSERT" ? p.new.id : null);
          if (p.eventType === "INSERT" && !BOARD)
            toast(`Token ${p.new.token_number} — ${p.new.customer_name}`);
        })
      .subscribe();
  }
  after();
}

function applyChange(p) {
  if (p.eventType === "INSERT") {
    if (!state.rows.some((r) => r.id === p.new.id)) state.rows.push(p.new);
  } else if (p.eventType === "UPDATE") {
    const i = state.rows.findIndex((r) => r.id === p.new.id);
    if (i >= 0) state.rows[i] = p.new;
  } else if (p.eventType === "DELETE") {
    state.rows = state.rows.filter((r) => r.id !== p.old.id);
  }
}

/* ---------- rendering ---------- */
function counts() {
  return {
    waiting: state.rows.filter((r) => r.status === "waiting").length,
    printing: state.rows.filter((r) => r.status === "printing").length,
    done: state.rows.filter((r) => r.status === "completed" || r.status === "cancelled").length,
  };
}

function renderDash(flashId) {
  const c = counts();
  $("#stWaiting").textContent = c.waiting;
  $("#stPrinting").textContent = c.printing;
  $("#stDone").textContent = c.done;
  $("#stWaiting").closest(".stat").classList.toggle("hot", c.waiting > 0);
  $("#cWaiting").textContent = c.waiting;
  $("#cPrinting").textContent = c.printing;
  $("#cDone").textContent = c.done;

  const list = $("#queueList");
  let rows = state.rows.filter((r) =>
    state.tab === "done"
      ? r.status === "completed" || r.status === "cancelled"
      : r.status === state.tab);
  rows.sort((a, b) => a.token_number - b.token_number);

  if (!rows.length) {
    const msg = {
      waiting: ["Queue is clear", "New uploads will appear here instantly."],
      printing: ["Nothing on the printer", "Use “Call next token” or start a job manually."],
      done: ["Nothing finished yet", "Completed and cancelled tokens show up here."],
    }[state.tab];
    list.innerHTML = `<div class="empty"><div class="big">${msg[0]}</div><div>${msg[1]}</div></div>`;
    return;
  }
  list.innerHTML = rows.map(cardHTML).join("");
  if (flashId) {
    const el = list.querySelector(`[data-id="${flashId}"]`);
    if (el) { el.classList.add("flash"); el.scrollIntoView({ block: "nearest" }); }
  }
}

function cardHTML(r) {
  const s = r.print_settings || {};
  const chips = [
    s.color ? `<span class="chip accent">Colour</span>` : `<span class="chip">B&amp;W</span>`,
    `<span class="chip">${s.copies || 1} ${(s.copies || 1) === 1 ? "copy" : "copies"}</span>`,
    s.pages && s.pages !== "all" ? `<span class="chip">pp. ${esc(s.pages)}</span>` : "",
    s.double_sided ? `<span class="chip">Double-sided</span>` : "",
  ].join("");
  const note = s.note ? `<div class="qnote">“${esc(s.note)}”</div>` : "";
  const phone = r.phone_number ? ` · ${esc(r.phone_number)}` : "";

  let actions = "";
  if (r.status === "waiting") {
    actions = `<button class="btn ghost small" data-act="dl">Download</button>
      <button class="btn primary small" data-act="print" style="width:auto">Start printing</button>
      <button class="btn danger-text" data-act="cancel">Cancel</button>`;
  } else if (r.status === "printing") {
    actions = `<button class="btn ghost small" data-act="dl">Download</button>
      <button class="btn primary small" data-act="done" style="width:auto">Mark done</button>
      <button class="btn danger-text" data-act="cancel">Cancel</button>`;
  } else {
    actions = `<button class="btn ghost small" data-act="dl">Download</button>`;
  }

  return `<div class="qcard" data-id="${r.id}">
    <div class="qcard-top">
      <div class="qtoken">${r.token_number}</div>
      <div class="qmeta">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span class="qname">${esc(r.customer_name)}</span>
          <span class="st ${r.status}">${STATUS_LABEL[r.status]}</span>
        </div>
        <div class="qtime">${timeAgo(r.created_at)}${phone}</div>
        <div class="qfile"><span class="fn">${esc(shortFileName(r.file_name))}</span>
          <span class="fs">${fmtBytes(r.file_size_bytes)}</span></div>
        <div class="chips">${chips}</div>
        ${note}
      </div>
    </div>
    <div class="qactions">${actions}</div>
  </div>`;
}

function timeAgo(iso) {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return s + "s ago";
  const m = Math.round(s / 60);
  if (m < 60) return m + "m ago";
  return Math.round(m / 60) + "h ago";
}

/* ---------- actions ---------- */
async function onCardAction(e) {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const card = btn.closest("[data-id]");
  const row = state.rows.find((r) => r.id === card.dataset.id);
  if (!row) return;
  const act = btn.dataset.act;

  if (act === "dl") return downloadRow(row, btn);
  const next = { print: "printing", done: "completed", cancel: "cancelled" }[act];
  if (!next) return;
  btn.disabled = true;
  try {
    if (DEMO || !isConfigured()) {
      row.status = next;
    } else {
      const { error } = await state.sb.from("queue_items").update({ status: next }).eq("id", row.id);
      if (error) throw error;
      // realtime echo will update the UI; optimistic patch for snappiness:
      row.status = next;
    }
    renderDash();
    if (next === "printing") toast(`Token ${row.token_number} is now printing.`);
    if (next === "completed") toast(`Token ${row.token_number} marked done.`);
  } catch (err) {
    toast("Update failed: " + (err.message || err));
  } finally {
    btn.disabled = false;
  }
}

async function downloadRow(row, btn) {
  if (DEMO || !isConfigured() || !row.file_url) { toast("Demo preview — no file to download."); return; }
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = "Preparing…";
  try {
    const { data, error } = await state.sb.storage.from("documents").createSignedUrl(row.file_url, 3600);
    if (error) throw error;
    window.open(data.signedUrl, "_blank", "noopener");
  } catch (err) {
    toast("Download failed: " + (err.message || err));
  } finally {
    btn.disabled = false; btn.textContent = label;
  }
}

async function callNext() {
  const next = state.rows
    .filter((r) => r.status === "waiting")
    .sort((a, b) => a.token_number - b.token_number)[0];
  if (!next) { toast("Nobody is waiting."); return; }
  try {
    if (DEMO || !isConfigured()) next.status = "printing";
    else {
      const { error } = await state.sb.from("queue_items").update({ status: "printing" }).eq("id", next.id);
      if (error) throw error;
      next.status = "printing";
    }
    if (state.tab !== "waiting") {
      state.tab = "waiting";
      $$(".tabs button").forEach((x) => x.setAttribute("aria-selected", x.dataset.tab === "waiting" ? "true" : "false"));
    }
    renderDash();
    toast(`Token ${next.token_number} — ${next.customer_name} — is now printing.`);
  } catch (err) {
    toast("Could not advance queue: " + (err.message || err));
  }
}

/* demo: a new customer walks in a few seconds after opening the preview */
function simulateArrival() {
  setTimeout(() => {
    if ($("#view-dash").hidden) return;
    const n = Math.max(...state.rows.map((r) => r.token_number)) + 1;
    state.rows.push({
      id: "demo-new", queue_date: todayISO(), token_number: n,
      customer_name: "Dev Patel", phone_number: "", file_name: "hall-ticket.pdf",
      file_url: "", file_size_bytes: 640000,
      print_settings: { color: false, copies: 1, pages: "all", double_sided: false, note: "" },
      status: "waiting", created_at: new Date().toISOString(),
    });
    if (!state.muted) chime();
    renderDash("demo-new");
    toast(`Token ${n} — Dev Patel (demo arrival)`);
  }, 6000);
}

window.__sqBoot = true;
