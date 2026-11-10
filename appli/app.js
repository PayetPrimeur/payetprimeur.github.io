/* Payet Primeur Pro — stock, commandes, admin (base Firebase « stock-romain ») */
// configuration web du projet Firebase (ces valeurs ne sont pas secrètes : la protection vient des comptes et des règles)
const firebaseConfig = {
  apiKey: "AIzaSyDktc4NLMqB-f3x5n2Mlr8dAdAs1XOZcN0",
  authDomain: "stock-romain.firebaseapp.com",
  databaseURL: "https://stock-romain-default-rtdb.europe-west1.firebasedatabase.app/",
  projectId: "stock-romain"
};
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const auth = firebase.auth();
let role = null; // "admin" ou "equipe", lu dans acces/<uid> (modifiable seulement depuis la console Firebase)
const APP_V = "202611102112";
// mise à jour automatique : si une version plus récente est en ligne, on recharge une fois
(function checkVersion() {
  const run = () => fetch("version.json?t=" + Date.now(), { cache: "no-store" }).then(r => r.json()).then(j => {
    if (!j || !j.v || j.v === APP_V) return;
    let last = ""; try { last = sessionStorage.getItem("reloadedFor") || ""; } catch (e) {}
    if (last === j.v) return;
    try { sessionStorage.setItem("reloadedFor", j.v); } catch (e) {}
    location.reload();
  }).catch(() => {});
  run();
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") run(); });
})();

const SITES = { "st-selve": "St Selve", "villenave": "Villenave" };
const CATS = ["Fruit", "Légume", "Aromate", "Épicerie", "Fourniture", "Plateaux", "Panier de la semaine"];
const CAT_LABEL = { "Fruit": "Fruits", "Légume": "Légumes", "Aromate": "Aromates", "Épicerie": "Épicerie", "Fourniture": "Fournitures", "Plateaux": "Plateaux", "Panier de la semaine": "Paniers" };
const TYPES = [["Retrait libre", "Libre"], ["Panier", "Panier"], ["Panier Garni", "Panier garni"], ["Plateau", "Plateau"]];
const PRIX = ["10€", "20€"];

let data = { products: [], stocks: {}, reservations: {}, paniers: {}, sauvegardes: {} };
let view = "stock", curSite = "st-selve", curCat = "Tout", query = "";
let selDate = isoDay(new Date()), monthStart = monthOf(new Date());
let showAllBackups = false, newCat = "Fruit";

/* ---------- outils ---------- */
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const catClass = c => c.replace(/ /g, "-");
function isoDay(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function parseDay(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
function monthOf(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function mondayOf(d) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
const stockOf = (n, site) => (data.stocks[n] && data.stocks[n][site]) || 0;
const icon = {
  minus: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>',
  plus: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg>',
  check: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>',
  pen: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>',
  trash: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/></svg>',
  close: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12"/><path d="M18 6 6 18"/></svg>'
};
function toast(t) {
  const el = document.createElement("div"); el.className = "toast"; el.setAttribute("role", "status"); el.textContent = t;
  document.body.appendChild(el); setTimeout(() => el.remove(), 2600);
}

/* ---------- données ---------- */
// chaque partie de la base est écoutée séparément ; les sauvegardes ne sont chargées qu'à l'ouverture de l'admin
const NODES = ["products", "stocks", "reservations", "paniers"], loaded = {};
function startData() { NODES.forEach(k => db.ref(k).on("value", snap => {
  const v = snap.val();
  if (k === "products") {
    data.products = (Array.isArray(v) ? v : Object.values(v || {})).filter(p => p && p.n);
    data.products.sort((a, b) => a.n.localeCompare(b.n, "fr"));
  } else data[k] = v || {};
  loaded[k] = true;
  if (NODES.every(n => loaded[n])) window.QR_DATA_OK = true; else return;
  renderAll();
  if (window.QR) QR.onData();
  if (window.STATS) STATS.onData();
  if (window.LISTE) LISTE.onData();
})); }
let backupsOk = false, backupsWatched = false;
function watchBackups() {
  if (backupsWatched || role !== "admin") return; backupsWatched = true;
  db.ref("sauvegardes/stocks").on("value", snap => {
    data.sauvegardes = snap.val() || {}; backupsOk = true;
    if (view === "admin") renderAdmin();
    if (window.STATS) STATS.onData();
    if (window.LISTE) LISTE.onData();
  });
}

/* ---------- navigation ---------- */
function go(v) {
  view = v;
  document.querySelectorAll(".view").forEach(el => el.classList.toggle("active", el.id === "view-" + v));
  document.querySelectorAll(".nav button").forEach(b => { if (b.dataset.go === v) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  $("fab").classList.toggle("hidden", v !== "agenda");
  window.scrollTo(0, 0);
  renderAll();
}
function renderAll() { if (view === "stock") renderStock(); if (view === "agenda") renderAgenda(); if (view === "admin") renderAdmin(); }

/* ---------- stock ---------- */
function renderStock() {
  document.querySelectorAll("#site-seg button").forEach(b => b.setAttribute("aria-pressed", b.dataset.site === curSite));
  const present = CATS.filter(c => data.products.some(p => p.c === c));
  $("cat-chips").innerHTML = [`<button type="button" class="chip c-tout" data-cat="Tout" aria-pressed="${curCat === "Tout"}">Tout</button>`]
    .concat(present.map(c => `<button type="button" class="chip c-${catClass(c)}" data-cat="${esc(c)}" aria-pressed="${curCat === c}">${esc(CAT_LABEL[c] || c)}</button>`)).join("");
  const q = query.trim().toLowerCase();
  let html = "";
  for (const c of present) {
    if (curCat !== "Tout" && curCat !== c) continue;
    const items = data.products.filter(p => p.c === c && (!q || p.n.toLowerCase().includes(q)));
    if (!items.length) continue;
    const besoin = items.filter(p => stockOf(p.n, curSite) > 0).length;
    html += `<div class="sec-head"><h2 class="t-${catClass(c)}">${esc(CAT_LABEL[c] || c)}</h2><span>${besoin} à prévoir sur ${items.length}</span></div>`;
    html += items.map(p => {
      const qn = stockOf(p.n, curSite);
      return `<div class="item"><div class="item-name"><b>${esc(p.n)}</b></div>
        <div class="stepper"><button type="button" data-step="-1" data-n="${esc(p.n)}" aria-label="Retirer un ${esc(p.n)}">${icon.minus}</button>
        <output aria-live="polite">${qn}</output>
        <button type="button" class="plus" data-step="1" data-n="${esc(p.n)}" aria-label="Ajouter un ${esc(p.n)}">${icon.plus}</button></div></div>`;
    }).join("");
  }
  $("stock-list").innerHTML = html || `<p class="empty">${q ? "Aucun produit ne correspond à la recherche." : "Aucun produit."}</p>`;
}
function updQty(n, v) {
  const s = Object.assign({ "st-selve": 0, "villenave": 0 }, data.stocks[n] || {});
  s[curSite] = Math.max(0, (s[curSite] || 0) + v);
  data.stocks[n] = s;
  db.ref("stocks/" + n).set(s);
  renderStock();
}

/* ---------- commandes ---------- */
const typeLabel = r => (TYPES.find(t => t[0] === r.type) || [r.type, r.type])[1] + (r.prix ? " " + r.prix.replace("€", " €") : "");
const qtyOf = r => Math.max(1, parseInt(r && r.nb, 10) || 1);
const qtyLabel = r => (qtyOf(r) > 1 ? qtyOf(r) + " × " : "") + typeLabel(r);
function ordersOf(day) { return Object.entries(data.reservations).filter(([, r]) => r && r.date === day); }
function renderAgenda() {
  const y = monthStart.getFullYear(), m = monthStart.getMonth();
  const lab = monthStart.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  $("week-label").textContent = lab.charAt(0).toUpperCase() + lab.slice(1);
  const today = isoDay(new Date());
  const lead = (monthStart.getDay() + 6) % 7, nbDays = new Date(y, m + 1, 0).getDate();
  let w = ["L", "M", "M", "J", "V", "S", "D"].map(l => `<span class="dow" aria-hidden="true">${l}</span>`).join("");
  for (let i = 0; i < lead; i++) w += `<span></span>`;
  for (let j = 1; j <= nbDays; j++) {
    const d = new Date(y, m, j), key = isoDay(d), list = ordersOf(key), nb = list.length;
    const shops = Object.keys(SITES).filter(site => list.some(([, r]) => r.boutique === site));
    const dots = shops.map(site => `<i class="dot ${site}"></i>`).join("");
    const who = shops.length ? " (" + shops.map(site => SITES[site]).join(" et ") + ")" : "";
    w += `<button type="button" class="day ${key === today ? "today" : ""}" data-day="${key}" aria-pressed="${key === selDate}" aria-label="${d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}, ${nb} commande${nb > 1 ? "s" : ""}${who}">
      <span class="n">${j}</span><span class="c">${dots}</span></button>`;
  }
  $("week").innerHTML = w;
  const res = ordersOf(selDate).sort((a, b) => (a[1].done === b[1].done ? 0 : a[1].done ? 1 : -1));
  const dd = parseDay(selDate).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  let html = `<div class="day-title"><h2>${dd.charAt(0).toUpperCase() + dd.slice(1)}</h2><span>${res.length} commande${res.length > 1 ? "s" : ""}</span></div>`;
  if (res.length) {
    html += `<div class="recap">` + Object.keys(SITES).map(site => {
      const c = {};
      res.filter(([, r]) => r.boutique === site).forEach(([, r]) => { const k = typeLabel(r); c[k] = (c[k] || 0) + qtyOf(r); });
      const txt = Object.entries(c).map(([k, n]) => `${n} × ${k}`).join(" · ") || "Rien";
      return `<div><b class="s-${site}">${SITES[site]}</b><span>${esc(txt)}</span></div>`;
    }).join("") + `</div>`;
    html += res.map(([id, r]) => {
      const tel = (r.tel || "").trim();
      return `<div class="order ${r.done ? "done" : ""}"><div class="bar ${esc(r.boutique)}"></div>
        <div class="order-main"><div class="who"><b>${esc(r.client || "Client inconnu")}</b><span class="pill">${esc(qtyLabel(r))}</span></div>
          <span class="meta">${SITES[r.boutique] || ""}${tel ? ` · <a href="tel:${esc(tel.replace(/[^\d+]/g, ""))}">${esc(tel)}</a>` : ""}</span>
          ${r.desc ? `<span class="note">${esc(r.desc)}</span>` : ""}</div>
        <div class="order-actions">
          <button type="button" class="check" data-done="${esc(id)}" aria-label="${r.done ? "Marquer comme non retirée" : "Marquer comme retirée"}">${icon.check}</button>
          <button type="button" data-edit="${esc(id)}" aria-label="Modifier la commande de ${esc(r.client || "")}">${icon.pen}</button>
        </div></div>`;
    }).join("");
  } else html += `<p class="empty">Rien de prévu pour ce jour.</p>`;
  $("orders").innerHTML = html;
}

function orderSheet(id) {
  const r = id ? Object.assign({}, data.reservations[id]) : { date: selDate, boutique: curSite, type: "Retrait libre", prix: "", client: "", tel: "", desc: "", done: false };
  const st = { boutique: r.boutique || "st-selve", type: r.type || "Retrait libre", prix: r.prix || "20€", nb: qtyOf(r), confirmDel: false };
  const sheet = openSheet(id ? "Modifier la commande" : "Nouvelle commande", "");
  const draw = () => {
    sheet.body.innerHTML = `
      <div class="field">Boutique<div class="seg" role="group" aria-label="Boutique">${Object.entries(SITES).map(([k, v]) => `<button type="button" data-b="${k}" aria-pressed="${st.boutique === k}">${v}</button>`).join("")}</div></div>
      <div class="field">Type de commande<div class="pick">${TYPES.map(([k, v]) => `<button type="button" data-t="${esc(k)}" aria-pressed="${st.type === k}">${v}</button>`).join("")}</div>
        ${st.type === "Panier" ? `<div class="pick" aria-label="Budget">${PRIX.map(p => `<button type="button" data-p="${p}" aria-pressed="${st.prix === p}">${p.replace("€", " €")}</button>`).join("")}</div>` : ""}</div>
      <div class="field">Quantité<div class="qty-row"><div class="stepper">
        <button type="button" data-q="-1" aria-label="Une de moins"${st.nb <= 1 ? " disabled" : ""}>${icon.minus}</button>
        <output id="f-nb" aria-live="polite">${st.nb}</output>
        <button type="button" class="plus" data-q="1" aria-label="Une de plus">${icon.plus}</button></div></div></div>
      <div class="two"><label class="field">Client<input id="f-client" value="${esc(r.client)}" autocomplete="off" placeholder="Ex : Jean Dupont"></label>
        <label class="field">Date de retrait<input id="f-date" type="date" value="${esc(r.date)}"></label></div>
      <label class="field">Téléphone<input id="f-tel" type="tel" value="${esc(r.tel)}" placeholder="06 12 34 56 78"></label>
      <label class="field">Notes<textarea id="f-desc" rows="2" placeholder="Détails (facultatif)">${esc(r.desc)}</textarea></label>
      <p class="err" id="f-err" role="alert"></p>
      <button type="button" class="btn main wide" id="f-save">${id ? "Enregistrer les modifications" : "Enregistrer la commande"}</button>
      ${id ? (st.confirmDel
        ? `<p>Supprimer définitivement la commande de ${esc(r.client || "ce client")} ?</p><div class="two"><button type="button" class="btn wide" id="f-nodel">Annuler</button><button type="button" class="btn danger wide" id="f-del-ok">Oui, supprimer</button></div>`
        : `<button type="button" class="btn danger wide" id="f-del">${icon.trash} Supprimer la commande</button>`) : ""}`;
    const keep = () => { r.client = $("f-client").value; r.date = $("f-date").value; r.tel = $("f-tel").value; r.desc = $("f-desc").value; };
    sheet.body.querySelectorAll("[data-b]").forEach(b => b.onclick = () => { keep(); st.boutique = b.dataset.b; draw(); });
    sheet.body.querySelectorAll("[data-t]").forEach(b => b.onclick = () => { keep(); st.type = b.dataset.t; draw(); });
    sheet.body.querySelectorAll("[data-p]").forEach(b => b.onclick = () => { keep(); st.prix = b.dataset.p; draw(); });
    sheet.body.querySelectorAll("[data-q]").forEach(b => b.onclick = () => { keep(); st.nb = Math.max(1, Math.min(99, st.nb + Number(b.dataset.q))); draw(); });
    $("f-save").onclick = () => {
      keep();
      if (!r.client.trim()) { $("f-err").textContent = "Saisissez le nom du client."; $("f-client").focus(); return; }
      if (!r.date) { $("f-err").textContent = "Choisissez la date de retrait."; return; }
      const rec = { date: r.date, boutique: st.boutique, type: st.type, prix: st.type === "Panier" ? st.prix : "", client: r.client.trim(), tel: r.tel.trim(), desc: r.desc.trim(), nb: st.nb, done: !!r.done };
      if (id) db.ref("reservations/" + id).set(rec); else db.ref("reservations").push(rec);
      selDate = r.date; monthStart = monthOf(parseDay(r.date));
      sheet.close(); toast(id ? "Commande modifiée" : "Commande enregistrée");
    };
    if ($("f-del")) $("f-del").onclick = () => { keep(); st.confirmDel = true; draw(); };
    if ($("f-nodel")) $("f-nodel").onclick = () => { st.confirmDel = false; draw(); };
    if ($("f-del-ok")) $("f-del-ok").onclick = () => { db.ref("reservations/" + id).remove(); sheet.close(); toast("Commande supprimée"); };
  };
  draw();
  if (!id) setTimeout(() => $("f-client") && $("f-client").focus(), 50);
}

/* ---------- feuilles ---------- */
function openSheet(title, html) {
  const bg = document.createElement("div"); bg.className = "sheet-bg";
  bg.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="grab"></div>
    <div class="sheet-head"><h2>${esc(title)}</h2><button type="button" class="icon-btn" aria-label="Fermer">${icon.close}</button></div><div class="sheet-body" style="display:grid;gap:14px">${html}</div></div>`;
  document.body.appendChild(bg); document.body.style.overflow = "hidden";
  const close = () => { bg.remove(); if (!document.querySelector(".sheet-bg") && !document.querySelector(".qr-panel:not([hidden])")) document.body.style.overflow = ""; };
  bg.querySelector(".sheet-head button").onclick = close;
  bg.addEventListener("click", e => { if (e.target === bg) close(); });
  return { body: bg.querySelector(".sheet-body"), close };
}
function confirmSheet(title, text, okLabel, onOk) {
  const s = openSheet(title, `<p>${esc(text)}</p><div class="two"><button type="button" class="btn wide" data-no>Annuler</button><button type="button" class="btn danger wide" data-ok>${esc(okLabel)}</button></div>`);
  s.body.querySelector("[data-no]").onclick = s.close;
  s.body.querySelector("[data-ok]").onclick = () => { s.close(); onOk(); };
}
/* ---------- connexion ---------- */
const AUTH_ERR = {
  "auth/invalid-email": "Adresse e-mail invalide.",
  "auth/user-disabled": "Ce compte est désactivé.",
  "auth/user-not-found": "E-mail ou mot de passe incorrect.",
  "auth/wrong-password": "E-mail ou mot de passe incorrect.",
  "auth/invalid-login-credentials": "E-mail ou mot de passe incorrect.",
  "auth/invalid-credential": "E-mail ou mot de passe incorrect.",
  "auth/too-many-requests": "Trop d'essais. Réessayez dans quelques minutes.",
  "auth/network-request-failed": "Pas de connexion internet.",
  "auth/weak-password": "Mot de passe trop faible.",
  "auth/requires-recent-login": "Reconnectez-vous puis recommencez."
};
const authMsg = e => AUTH_ERR[e && e.code] || "Une erreur est survenue. Réessayez.";
let loginMsg = "";
function showLogin(msg) {
  document.body.classList.add("locked");
  $("login-err").textContent = msg || loginMsg;
  $("login-btn").disabled = false;
}
$("login-form").addEventListener("submit", e => {
  e.preventDefault();
  const em = $("login-email").value.trim(), pw = $("login-pw").value;
  if (!em || !pw) { $("login-err").textContent = "Saisissez l'e-mail et le mot de passe."; return; }
  $("login-btn").disabled = true; $("login-err").textContent = ""; loginMsg = "";
  auth.signInWithEmailAndPassword(em, pw).catch(err => { $("login-btn").disabled = false; $("login-err").textContent = authMsg(err); });
});
$("login-show").onclick = () => { const i = $("login-pw"); i.type = i.type === "password" ? "text" : "password"; $("login-show").textContent = i.type === "password" ? "Afficher" : "Masquer"; };
$("login-forgot").onclick = () => {
  const em = $("login-email").value.trim();
  if (!em) { $("login-err").textContent = "Saisissez d'abord votre e-mail."; return; }
  auth.sendPasswordResetEmail(em).then(() => { $("login-err").textContent = ""; toast("Si ce compte existe, un e-mail vient d'être envoyé."); })
    .catch(err => { $("login-err").textContent = authMsg(err); });
};
let started = false;
auth.onAuthStateChanged(user => {
  if (!user) { role = null; return showLogin(); }
  db.ref("acces/" + user.uid).once("value").then(s => {
    const r = s.val();
    if (r !== "admin" && r !== "equipe") { loginMsg = "Ce compte n'a pas accès à l'appli."; auth.signOut(); return showLogin(); }
    role = r;
    document.body.classList.remove("locked");
    document.body.classList.toggle("is-admin", role === "admin");
    $("login-pw").value = "";
    document.querySelector('.nav button[data-go="admin"] .lbl').textContent = role === "admin" ? "Admin" : "Compte";
    $("admin-title").textContent = role === "admin" ? "Admin" : "Mon compte";
    if (!started) { started = true; startData(); }
    renderAll();
  }).catch(() => { loginMsg = "Accès refusé."; auth.signOut(); showLogin(); });
});
function logout() { auth.signOut().then(() => location.reload()); }
function changePassword() {
  const s = openSheet("Changer le mot de passe", `<p class="hint">Au moins 10 caractères. Le nouveau mot de passe sera demandé sur tous les téléphones connectés à ce compte.</p>
    <label class="field">Mot de passe actuel<input id="pw-old" type="password" autocomplete="current-password"></label>
    <label class="field">Nouveau mot de passe<input id="pw-new" type="password" autocomplete="new-password"></label>
    <label class="field">Confirmer le nouveau mot de passe<input id="pw-new2" type="password" autocomplete="new-password"></label>
    <p class="err" id="pw-err" role="alert"></p><button type="button" class="btn main wide" id="pw-ok">Enregistrer</button>`);
  $("pw-ok").onclick = () => {
    const o = $("pw-old").value, n = $("pw-new").value, n2 = $("pw-new2").value, u = auth.currentUser;
    if (n.length < 10) { $("pw-err").textContent = "Le nouveau mot de passe doit faire au moins 10 caractères."; return; }
    if (n !== n2) { $("pw-err").textContent = "Les deux nouveaux mots de passe ne sont pas identiques."; return; }
    $("pw-ok").disabled = true;
    const cred = firebase.auth.EmailAuthProvider.credential(u.email, o);
    u.reauthenticateWithCredential(cred).then(() => u.updatePassword(n)).then(() => { s.close(); toast("Mot de passe modifié"); })
      .catch(err => { $("pw-ok").disabled = false; $("pw-err").textContent = authMsg(err); });
  };
}

/* ---------- admin ---------- */
function backupList() { return Object.entries(data.sauvegardes).filter(([, b]) => b && b.stocks).sort((a, b) => b[0].localeCompare(a[0])); }
const backupLabel = key => { const d = parseDay(key); const t = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" }); return t.charAt(0).toUpperCase() + t.slice(1) + " · minuit"; };
function renderAdmin() {
  const u = auth.currentUser;
  $("acct-email").textContent = u ? u.email : "";
  $("acct-role").textContent = role === "admin" ? "Administrateur" : "Équipe";
  if (role !== "admin") return;
  watchBackups();
  const bk = backupList(), shown = showAllBackups ? bk : bk.slice(0, 3);
  $("backups").innerHTML = !backupsOk ? `<p class="empty" style="padding:6px 0">Chargement des sauvegardes…</p>` : shown.length ? shown.map(([k]) => `<div class="backup"><span>${esc(backupLabel(k))}</span>
      <button type="button" class="btn" data-bpdf="${esc(k)}">PDF</button><button type="button" class="btn dark" data-brest="${esc(k)}">Restaurer</button></div>`).join("")
    + (bk.length > 3 ? `<button type="button" class="link" id="more-backups">${showAllBackups ? "Afficher moins" : `Voir les ${bk.length - 3} sauvegardes précédentes`}</button>` : "")
    : `<p class="empty" style="padding:6px 0">La première sauvegarde sera faite ce soir à minuit (mardi, jeudi, vendredi et samedi).</p>`;
  $("new-cat").innerHTML = CATS.map(c => `<button type="button" data-nc="${esc(c)}" aria-pressed="${newCat === c}">${esc(c === "Panier de la semaine" ? "Panier" : c)}</button>`).join("");
  const nbEq = data.products.filter(p => eqComplet(p.u)).length;
  $("cat-count").textContent = `${data.products.length} produits · ${nbEq} avec unité d'achat`;
  $("catalogue").innerHTML = `<p class="hint" style="margin:0 0 6px">Unité d'achat : ce que représente « 1 » dans les stocks (ex. 1 = 5 kg, 1 = 1 pièce, 1 = 1 botte), pour des statistiques précises. Les stocks se notent comme avant.</p>` +
    data.products.map(p => `<div class="cat-row"><b>${esc(p.n)}<small>${esc(p.c)}</small></b>
      <button type="button" class="eq-btn${eqComplet(p.u) ? " set" : p.u ? " part" : ""}" data-eq="${esc(p.n)}" aria-label="Équivalence de ${esc(p.n)}">${esc(eqLabel(p.u))}</button>
      <button type="button" data-del="${esc(p.n)}" aria-label="Supprimer ${esc(p.n)}">${icon.trash}</button></div>`).join("");
}
const UNITS = [["kg", "kg", "kg"], ["pc", "pièce", "pièces"], ["botte", "botte", "bottes"], ["barq", "barquette", "barquettes"]];
const fmtQ = q => String(Math.round(Number(q) * 1000) / 1000).replace(".", ",");
function eqLabel(u) {
  if (!u || !(Number(u.q) > 0)) return "+ Équivalence";
  const U = UNITS.find(x => x[0] === u.t) || UNITS[0];
  if (U[0] === "kg") return `1 = ${fmtQ(u.q)} kg`;
  const base = `1 = ${fmtQ(u.q)} ${Number(u.q) > 1 ? U[2] : U[1]}`;
  return Number(u.kg) > 0 ? `${base} · ${fmtQ(Number(u.q) * Number(u.kg))} kg` : base;
}
const eqComplet = u => u && Number(u.q) > 0;
function eqSheet(n) {
  const p = data.products.find(x => x.n === n); if (!p) return;
  const st = { t: (p.u && p.u.t) || "kg" };
  const U1 = () => (UNITS.find(x => x[0] === st.t) || UNITS[0])[1];
  const sh = openSheet(`Équivalence : ${n}`, "");
  const draw = () => {
    const cur = sh.body.querySelector("#eq-q") ? sh.body.querySelector("#eq-q").value : (p.u && Number(p.u.q) > 0 ? fmtQ(p.u.q) : "");
    const curKg = sh.body.querySelector("#eq-kg") ? sh.body.querySelector("#eq-kg").value : (p.u && Number(p.u.kg) > 0 ? fmtQ(p.u.kg) : "");
    sh.body.innerHTML = `<p class="hint">Quand l'équipe note « 1 » pour ce produit dans les stocks, cela représente :</p>
      <div class="eq-line"><input id="eq-q" type="text" inputmode="decimal" placeholder="ex. 5" value="${esc(cur)}" aria-label="Quantité">
        <div class="pick" role="group" aria-label="Unité">${UNITS.map(u => `<button type="button" data-eu="${u[0]}" aria-pressed="${st.t === u[0]}">${u[2]}</button>`).join("")}</div></div>
      ${st.t !== "kg" ? `<label class="field">Facultatif : poids d'une ${esc(U1())}, en kg<input id="eq-kg" type="text" inputmode="decimal" placeholder="à laisser vide si vous achetez à l'unité" value="${esc(curKg)}"></label>
        <p class="hint">Laissez vide pour un produit acheté à l'unité (ex. les choux) : il est compté en ${esc(U1())}s. Avec un poids, il compte aussi dans les totaux en kilos.</p>` : ""}
      <p class="hint">C'est l'unité dans laquelle vous achetez. Exemples : 1 caisse de courgettes = 5 kg ; 1 chou = 1 pièce ; 1 botte de persil = 1 botte. Seules les statistiques utilisent ces valeurs.</p>
      <p class="err" id="eq-err" role="alert"></p>
      <button type="button" class="btn main wide" id="eq-ok">Enregistrer</button>
      ${p.u ? `<button type="button" class="btn wide" id="eq-del">Retirer l'équivalence</button>` : ""}`;
    sh.body.querySelectorAll("[data-eu]").forEach(b => b.onclick = () => { st.t = b.dataset.eu; draw(); });
    $("eq-ok").onclick = () => {
      const q = Number($("eq-q").value.replace(",", ".").replace(/\s/g, ""));
      if (!(q > 0) || q > 10000) { $("eq-err").textContent = "Saisissez un nombre plus grand que 0 (ex. 5 ou 0,25)."; return; }
      const u = { q: Math.round(q * 1000) / 1000, t: st.t };
      if (st.t !== "kg") {
        const t = $("eq-kg").value.trim();
        if (t) {
          const kg = Number(t.replace(",", ".").replace(/\s/g, ""));
          if (!(kg > 0) || kg > 1000) { $("eq-err").textContent = `Le poids d'une ${U1()} doit être un nombre en kg (ex. 1 ou 0,3), ou restez vide.`; return; }
          u.kg = Math.round(kg * 1000) / 1000;
        }
      }
      save(u);
    };
    if ($("eq-del")) $("eq-del").onclick = () => save(null);
  };
  const save = u => {
    const list = data.products.map(x => x.n === n ? Object.assign({}, x, { u: u || null }) : x).map(x => { if (!x.u) { const y = Object.assign({}, x); delete y.u; return y; } return x; });
    db.ref("products").set(list).then(() => { sh.close(); toast(u ? "Équivalence enregistrée" : "Équivalence retirée"); }).catch(() => $("eq-err").textContent = "Échec de l'enregistrement.");
  };
  draw();
  setTimeout(() => { const i = $("eq-q"); if (i && !i.value) i.focus(); }, 50);
}
function addProduct() {
  const n = $("new-p-name").value.trim().replace(/\s+/g, " ");
  if (!n) { $("new-p-err").textContent = "Saisissez le nom du produit."; return; }
  if (data.products.some(p => p.n.toLowerCase() === n.toLowerCase())) { $("new-p-err").textContent = "Ce produit existe déjà."; return; }
  if (/[.#$\[\]\/]/.test(n)) { $("new-p-err").textContent = "Le nom ne peut pas contenir . # $ [ ] /"; return; }
  data.products.push(Object.assign({ n, c: newCat }, window.QR ? QR.fieldsFor(n, newCat) : {}));
  db.ref("products").set(data.products);
  $("new-p-name").value = ""; $("new-p-err").textContent = "";
  toast(`« ${n} » ajouté au catalogue`);
}
function delProd(n) {
  confirmSheet("Supprimer ce produit ?", `« ${n} » sera retiré du catalogue et son stock effacé.`, "Supprimer", () => {
    db.ref("products").set(data.products.filter(p => p.n !== n));
    db.ref("stocks/" + n).remove();
    toast("Produit supprimé");
  });
}
function resetStocks() {
  confirmSheet("Remettre tout à zéro ?", "Toutes les quantités nécessaires des deux boutiques passeront à 0. La dernière sauvegarde de minuit permet de revenir en arrière.", "Tout remettre à zéro", () => {
    const r = {}; data.products.forEach(p => { r[p.n] = { "st-selve": 0, "villenave": 0 }; });
    db.ref("stocks").set(r); toast("Quantités remises à zéro");
  });
}
function restoreBackup(k) {
  confirmSheet("Restaurer cette sauvegarde ?", `Les stocks nécessaires des deux boutiques seront remplacés par ceux du ${backupLabel(k).toLowerCase()}.`, "Restaurer", () => {
    db.ref("stocks").set(data.sauvegardes[k].stocks); toast("Sauvegarde restaurée");
  });
}
// logo préchargé pour le PDF (le PDF doit se créer sans attendre, sinon le partage sur iPhone est bloqué)
let LOGO_PDF = null;
(function () { const im = new Image(); im.onload = () => { try { const c = document.createElement("canvas"); c.width = im.naturalWidth; c.height = im.naturalHeight; c.getContext("2d").drawImage(im, 0, 0); LOGO_PDF = { url: c.toDataURL("image/png"), r: im.naturalWidth / im.naturalHeight }; } catch (e) {} }; im.src = "logo-payet.png"; })();

function generatePDF(stocks, titre, fichier) {
  stocks = stocks || data.stocks;
  const { jsPDF } = window.jspdf; const doc = new jsPDF({ unit: "mm", format: "a4" });
  const M = 14, W = 210 - 2 * M, now = new Date();
  // en-tête
  let x = M;
  if (LOGO_PDF) { const h = 10, w = h * LOGO_PDF.r; doc.addImage(LOGO_PDF.url, "PNG", M, 12, w, h); x = M + w + 4; }
  const jour = now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const droite1 = jour.charAt(0).toUpperCase() + jour.slice(1), droite2 = `Payet Primeur · édité à ${now.getHours()} h ${String(now.getMinutes()).padStart(2, "0")}`;
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); const wR = Math.max(doc.getTextWidth(droite1), (doc.setFont("helvetica", "normal"), doc.setFontSize(9.5), doc.getTextWidth(droite2)));
  doc.setTextColor(17); doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.text(droite1, 210 - M, 16.5, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(60); doc.text(droite2, 210 - M, 21.5, { align: "right" });
  // titre fixe ; pour une sauvegarde, sa date en sous-titre
  doc.setFont("helvetica", "bold"); doc.setTextColor(17); let fs = 18;
  while (fs > 12 && (doc.setFontSize(fs), doc.getTextWidth("STOCKS NÉCESSAIRES")) > 210 - M - wR - 6 - x) fs--;
  doc.text("STOCKS NÉCESSAIRES", x, titre ? 17.5 : 19.5);
  if (titre) { doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(60); doc.text(titre, x, 22.5); }
  doc.setDrawColor(17); doc.setLineWidth(0.8); doc.line(M, 25, 210 - M, 25);

  // lignes par catégorie
  const cat = Object.fromEntries(data.products.map(p => [p.n, p.c]));
  const q = (s, k) => { const v = Number(s && s[k]); return isFinite(v) && v > 0 ? v : 0; };
  const groups = {};
  Object.entries(stocks).forEach(([n, s]) => { const a = q(s, "st-selve"), b = q(s, "villenave"); if (a || b) (groups[cat[n] || "Autre"] = groups[cat[n] || "Autre"] || []).push([n, a, b]); });
  const order = CATS.concat(Object.keys(groups).filter(c => !CATS.includes(c)));
  const nb = Object.values(groups).reduce((x, g) => x + g.length, 0);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(60);
  doc.text(nb ? `${nb} produit${nb > 1 ? "s" : ""} à prévoir · « – » = rien à prévoir dans cette boutique` : "Rien à prévoir.", M, 31);
  let y = 35;
  order.filter(c => groups[c]).forEach(c => {
    const rows = groups[c].sort((a, b) => a[0].localeCompare(b[0], "fr"));
    const label = (CAT_LABEL[c] || c).toUpperCase();
    doc.autoTable({
      startY: y, margin: { left: M, right: M, top: 16, bottom: 18 }, showHead: "everyPage", theme: "plain",
      head: [
        [{ content: label, colSpan: 3, styles: { fillColor: [17, 17, 17], textColor: 255, fontStyle: "bold", fontSize: 12, halign: "left", cellPadding: { top: 2.2, bottom: 2.2, left: 3, right: 2 } } },
         { content: `${rows.length} produit${rows.length > 1 ? "s" : ""}`, colSpan: 2, styles: { fillColor: [17, 17, 17], textColor: 255, fontSize: 8.5, halign: "right", valign: "middle", cellPadding: { right: 3 } } }],
        ["PRODUIT", "ST SELVE", "VILLENAVE", "TOTAL", "FAIT"]
      ],
      body: rows.map(([n, a, b]) => [n, a || "–", b || "–", a + b, ""]),
      headStyles: { fillColor: [255, 255, 255], fontSize: 7.5, textColor: [70, 70, 70], fontStyle: "bold", halign: "center", lineWidth: { bottom: 0.4 }, lineColor: [17, 17, 17] },
      bodyStyles: { fillColor: [255, 255, 255], fontSize: 11, textColor: [17, 17, 17], halign: "center", valign: "middle", cellPadding: { top: 2.1, bottom: 2.1, left: 2, right: 2 }, lineWidth: { bottom: 0.2 }, lineColor: [190, 190, 190] },
      alternateRowStyles: { fillColor: [241, 241, 241] },
      columnStyles: { 0: { halign: "left", fontStyle: "bold", cellWidth: W * 0.46 }, 1: { cellWidth: W * 0.135 }, 2: { cellWidth: W * 0.135 }, 3: { cellWidth: W * 0.135, fontStyle: "bold", fontSize: 12.5 }, 4: { cellWidth: W * 0.135 } },
      didParseCell: d => { if (d.section === "head" && d.row.index === 1 && d.column.index === 0) d.cell.styles.halign = "left"; },
      willDrawCell: d => { if (d.section === "head" && d.row.index === 0 && d.column.index === 0 && d.table.pageNumber > 1) d.cell.text = [label + " (SUITE)"]; },
      didDrawCell: d => { if (d.section === "body" && d.column.index === 4) { const s = 3.6; doc.setDrawColor(17); doc.setLineWidth(0.35); doc.rect(d.cell.x + (d.cell.width - s) / 2, d.cell.y + (d.cell.height - s) / 2, s, s); } }
    });
    y = doc.lastAutoTable.finalY + 6;
  });
  // numéros de page
  const pages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(90); doc.text(`Page ${i} / ${pages}`, 105, 297 - 9, { align: "center" }); }
  saveFile(doc.output("blob"), fichier || "Stocks_necessaires.pdf");
}
// téléchargement direct du fichier ; sur iPhone en appli écran d'accueil, où le téléchargement n'existe pas,
// on ouvre le menu Partager (« Enregistrer dans Fichiers ») au lieu d'une page
function saveFile(blob, name) {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = window.navigator.standalone === true || (window.matchMedia && matchMedia("(display-mode: standalone)").matches);
  if (ios && standalone && navigator.canShare) {
    const file = new File([blob], name, { type: blob.type || "application/pdf" });
    if (navigator.canShare({ files: [file] })) {
      // si le partage est refusé (par ex. trop de temps depuis le toucher), on retombe sur le téléchargement
      navigator.share({ files: [file] }).catch(e => { if (!e || e.name !== "AbortError") downloadBlob(blob, name); });
      return;
    }
  }
  downloadBlob(blob, name);
}
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = name; a.rel = "noopener"; a.style.display = "none";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/* ---------- événements ---------- */
document.addEventListener("click", e => {
  const t = e.target.closest("button, a"); if (!t) return;
  const ds = t.dataset;
  if (ds.go) go(ds.go);
  else if (ds.site) { curSite = ds.site; renderStock(); }
  else if (ds.cat) { curCat = ds.cat; renderStock(); }
  else if (ds.step) updQty(ds.n, +ds.step);
  else if (ds.day) { selDate = ds.day; renderAgenda(); }
  else if (ds.done) { const r = data.reservations[ds.done]; db.ref("reservations/" + ds.done).update({ done: !(r && r.done) }); }
  else if (ds.edit) orderSheet(ds.edit);
  else if (ds.nc) { newCat = ds.nc; renderAdmin(); }
  else if (ds.eq) eqSheet(ds.eq);
  else if (ds.del) delProd(ds.del);
  else if (ds.brest) restoreBackup(ds.brest);
  else if (ds.bpdf) generatePDF(data.sauvegardes[ds.bpdf].stocks, `Sauvegarde du ${backupLabel(ds.bpdf).toLowerCase()}`, `Stocks_necessaires_${ds.bpdf}.pdf`);
  else if (t.id === "more-backups") { showAllBackups = !showAllBackups; renderAdmin(); }
});
$("prev-week").onclick = () => { monthStart.setMonth(monthStart.getMonth() - 1); renderAgenda(); };
$("next-week").onclick = () => { monthStart.setMonth(monthStart.getMonth() + 1); renderAgenda(); };
$("today-btn").onclick = () => { selDate = isoDay(new Date()); monthStart = monthOf(new Date()); renderAgenda(); };
$("fab").onclick = () => orderSheet(null);
$("pdf-btn").onclick = () => generatePDF();
$("pdf-btn-2").onclick = () => generatePDF();
$("reset-btn").onclick = resetStocks;
$("qr-btn").onclick = () => role === "admin" && window.openQrPanel && openQrPanel();
$("pw-btn").onclick = changePassword;
$("logout-btn").onclick = logout;
$("liste-btn").onclick = () => { if (role !== "admin") return; watchBackups(); window.LISTE && LISTE.open(); };
$("stats-btn").onclick = () => { if (role !== "admin") return; watchBackups(); window.STATS && STATS.open(); };
$("add-btn").onclick = addProduct;
$("new-p-name").onkeydown = e => { if (e.key === "Enter") addProduct(); };
document.addEventListener("keydown", e => { if (e.key === "Escape") { const s = document.querySelectorAll(".sheet-bg"); if (s.length) s[s.length - 1].querySelector(".sheet-head button").click(); } });
go("stock");
