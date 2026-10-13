/* Stationery Queue — customer portal logic. */
import {
  cfg, isConfigured, isDemo, getClient, todayISO,
  esc, fmtBytes, settingsLine, shortFileName, demoQueue,
} from "./sq.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const state = { file: null, copies: 1, color: false, row: null, channel: null };

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ---------- init ---------- */
document.querySelectorAll("[data-shop-name]").forEach((el) => (el.textContent = cfg().SHOP_NAME || "Stationery Shop"));
document.querySelector("[data-max-mb]").textContent = cfg().MAX_FILE_MB || 20;
if (isDemo()) $("[data-demo-tag]").hidden = false;
if (!isConfigured() && !isDemo()) $("[data-cfg-warn]").hidden = false;

/* ---------- file picking ---------- */
const dz = $("#dz"), inFile = $("#inFile"), chipBox = $("#fileChip");
const ACCEPT = ["application/pdf", "image/png", "image/jpeg", "image/webp"];

function pickFile(f) {
  if (!f) return;
  if (!ACCEPT.includes(f.type) && !/\.(pdf|png|jpe?g|webp)$/i.test(f.name)) {
    toast("Only PDF, JPG or PNG files, please.");
    return;
  }
  const max = (cfg().MAX_FILE_MB || 20) * 1024 * 1024;
  if (f.size > max) {
    toast(`That file is over ${cfg().MAX_FILE_MB || 20} MB.`);
    return;
  }
  state.file = f;
  dz.hidden = true;
  chipBox.hidden = false;
  chipBox.innerHTML =
    `<div class="filechip"><div><div class="fn">${esc(f.name)}</div>` +
    `<div class="fs">${fmtBytes(f.size)}</div></div>` +
    `<button type="button" class="rm" aria-label="Remove file">✕</button></div>`;
  chipBox.querySelector(".rm").onclick = () => {
    state.file = null; inFile.value = "";
    chipBox.hidden = true; dz.hidden = false;
  };
  clearInvalid("file");
}
dz.addEventListener("click", () => inFile.click());
dz.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") inFile.click(); });
inFile.addEventListener("change", () => pickFile(inFile.files[0]));
["dragover", "dragenter"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("over"); }));
["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("over"); }));
dz.addEventListener("drop", (e) => pickFile(e.dataTransfer.files[0]));

/* ---------- print options ---------- */
$("#segColor").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  state.color = b.dataset.v === "color";
  $$("#segColor button").forEach((x) => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
});
$("#cpMinus").onclick = () => { state.copies = Math.max(1, state.copies - 1); $("#cpVal").textContent = state.copies; };
$("#cpPlus").onclick = () => { state.copies = Math.min(99, state.copies + 1); $("#cpVal").textContent = state.copies; };
$$('input[name="pages"]').forEach((r) =>
  r.addEventListener("change", () => { $("#inPages").disabled = document.querySelector('input[name="pages"]:checked').value !== "custom"; })
);

/* ---------- validation ---------- */
function setInvalid(key, bad) {
  document.querySelector(`[data-f="${key}"]`).classList.toggle("invalid", bad);
  return !bad;
}
function clearInvalid(key) { setInvalid(key, false); }
$("#inName").addEventListener("input", () => clearInvalid("name"));

/* ---------- submit ---------- */
$("#uploadForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#inName").value.trim();
  let ok = setInvalid("name", !name);
  ok = setInvalid("file", !state.file) && ok;
  if (!ok) return;

  const settings = {
    color: state.color,
    copies: state.copies,
    pages: document.querySelector('input[name="pages"]:checked').value === "custom"
      ? ($("#inPages").value.trim() || "all") : "all",
    double_sided: $("#inDuplex").checked,
    note: $("#inNote").value.trim(),
  };

  const btn = $("#btnSubmit"), prog = $("#prog"), bar = $("#prog i");
  btn.disabled = true; btn.textContent = "Uploading…";
  prog.classList.add("show"); bar.style.width = "12%";

  try {
    let row;
    if (isDemo() || !isConfigured()) {
      await fakeProgress(bar);
      row = {
        id: "demo-me", queue_date: todayISO(),
        token_number: 17, customer_name: name, phone_number: $("#inPhone").value.trim(),
        file_name: state.file.name, file_url: "", file_size_bytes: state.file.size,
        print_settings: settings, status: "waiting", created_at: new Date().toISOString(),
      };
    } else {
      const sb = await getClient();
      const path = `${todayISO()}/${crypto.randomUUID()}_${state.file.name}`;
      const { error: upErr } = await sb.storage.from("documents").upload(path, state.file);
      if (upErr) throw new Error("Upload failed: " + upErr.message);
      bar.style.width = "70%";
      const { data, error: insErr } = await sb.from("queue_items")
        .insert([{
          customer_name: name,
          phone_number: $("#inPhone").value.trim() || null,
          file_name: state.file.name,
          file_url: path,
          file_size_bytes: state.file.size,
          print_settings: settings,
        }])
        .select()
        .single();
      if (insErr) throw new Error("Could not create token: " + insErr.message);
      bar.style.width = "100%";
      row = data;
    }
    showToken(row);
  } catch (err) {
    toast(err.message || "Something went wrong. Please try again.");
  } finally {
    btn.disabled = false; btn.textContent = "Get my token";
    setTimeout(() => { prog.classList.remove("show"); bar.style.width = "0"; }, 600);
  }
});

function fakeProgress(bar) {
  return new Promise((res) => {
    let w = 12;
    const h = setInterval(() => {
      w = Math.min(96, w + 14);
      bar.style.width = w + "%";
      if (w >= 96) { clearInterval(h); res(); }
    }, 160);
  });
}

/* ---------- token view ---------- */
function showToken(row) {
  state.row = row;
  $("#view-form").hidden = true;
  $("#view-token").hidden = false;
  $("#tokenNum").textContent = row.token_number;
  $("#dName").textContent = row.customer_name;
  $("#dFile").textContent = row.file_name;
  $("#dSettings").textContent = settingsLine(row.print_settings);
  renderStatus(row);
  window.scrollTo({ top: 0 });

  if (isDemo()) { simulateDemo(); return; }
  if (!isConfigured()) return;
  getClient().then((sb) => {
    state.channel = sb
      .channel("token-" + row.id)
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "queue_items", filter: `id=eq.${row.id}` },
        (p) => { state.row = p.new; renderStatus(p.new); })
      .subscribe();
    refreshPosition(sb);
  });
}

async function refreshPosition(sb) {
  const row = state.row;
  if (!row || row.status !== "waiting") return;
  const { count } = await sb.from("queue_items")
    .select("id", { count: "exact", head: true })
    .eq("queue_date", todayISO())
    .eq("status", "waiting")
    .lt("token_number", row.token_number);
  const ahead = count ?? 0;
  $("#queuePos").innerHTML = ahead === 0
    ? "<strong>You are next.</strong> Keep this screen open."
    : `<strong>${ahead} ahead of you.</strong> We will call token ${row.token_number}.`;
}

function renderStatus(row) {
  const order = ["waiting", "printing", "completed"];
  const idx = order.indexOf(row.status);
  $$("#timeline li").forEach((li) => {
    const s = li.dataset.s;
    const i = order.indexOf(s);
    li.classList.toggle("done", i < idx || row.status === "completed" && i <= idx);
    li.classList.toggle("now", i === idx && row.status !== "completed");
    li.querySelector(".dot").textContent = (i < idx || row.status === "completed") ? "✓" : (i === idx ? "●" : "");
    if (row.status === "completed" && s === "completed") li.classList.add("done");
  });
  if (row.status === "printing") {
    $("#queuePos").innerHTML = "<strong>On the printer now.</strong> Almost done.";
  } else if (row.status === "completed") {
    $("#queuePos").innerHTML = "<strong>Ready for pickup.</strong> Show this screen at the counter.";
  } else if (isDemo() || !isConfigured()) {
    $("#queuePos").innerHTML = "<strong>2 ahead of you.</strong> We will call token " + row.token_number + ".";
  }
}

/* demo: walk the token through the statuses so the preview feels alive */
function simulateDemo() {
  const seq = ["printing", "completed"];
  let i = 0;
  const h = setInterval(() => {
    if (i >= seq.length || $("#view-token").hidden) { clearInterval(h); return; }
    state.row.status = seq[i++];
    renderStatus(state.row);
    if (state.row.status === "completed") clearInterval(h);
  }, 9000);
}

$("#btnAgain").onclick = () => {
  state.channel?.unsubscribe?.();
  state.row = null; state.file = null;
  inFile.value = ""; chipBox.hidden = true; dz.hidden = false;
  $("#uploadForm").reset(); state.copies = 1; $("#cpVal").textContent = "1";
  $("#view-token").hidden = true; $("#view-form").hidden = false;
  window.scrollTo({ top: 0 });
};

window.__sqBoot = true;
