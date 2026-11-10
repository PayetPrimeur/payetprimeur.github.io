/* Payet Primeur Pro — stock, commandes, admin (base Firebase « stock-romain ») */
const firebaseConfig = { databaseURL: "https://stock-romain-default-rtdb.europe-west1.firebasedatabase.app/" };
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const MON_CODE = "Tomate47*";

const SITES = { "st-selve": "St Selve", "villenave": "Villenave" };
const CATS = ["Fruit", "Légume", "Aromate", "Épicerie", "Fourniture", "Plateaux", "Panier de la semaine"];
const CAT_LABEL = { "Fruit": "Fruits", "Légume": "Légumes", "Aromate": "Aromates", "Épicerie": "Épicerie", "Fourniture": "Fournitures", "Plateaux": "Plateaux", "Panier de la semaine": "Paniers" };
const TYPES = [["Retrait libre", "Libre"], ["Panier", "Panier"], ["Panier Garni", "Panier garni"], ["Plateau", "Plateau"]];
const PRIX = ["10€", "20€"];

let data = { products: [], stocks: {}, reservations: {}, paniers: {}, sauvegardes: {} };
let view = "stock", curSite = "st-selve", curCat = "Tout", query = "";
let selDate = isoDay(new Date()), weekStart = mondayOf(new Date());
let showAllBackups = false, newCat = "Fruit";

/* ---------- outils ---------- */
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const catClass = c => c.replace(/ /g, "-");
function isoDay(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function parseDay(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
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
db.ref("/").on("value", snap => {
  const d = snap.val() || {};
  data = {
    products: (Array.isArray(d.products) ? d.products : Object.values(d.products || {})).filter(p => p && p.n),
    stocks: d.stocks || {}, reservations: d.reservations || {}, paniers: d.paniers || {},
    sauvegardes: (d.sauvegardes && d.sauvegardes.stocks) || {}
  };
  data.products.sort((a, b) => a.n.localeCompare(b.n, "fr"));
  window.QR_DATA_OK = true;
  renderAll();
  if (window.QR) QR.onData();
});

/* ---------- navigation ---------- */
function isSessionValid() {
  try { const s = localStorage.getItem("adminSession"); return s && (Date.now() - parseInt(s, 10)) / 60000 < 20; } catch (e) { return false; }
}
function go(v) {
  if (v === "admin" && !isSessionValid()) { askCode(); return; }
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
    const inStock = items.filter(p => stockOf(p.n, curSite) > 0).length;
    html += `<div class="sec-head"><h2 class="t-${catClass(c)}">${esc(CAT_LABEL[c] || c)}</h2><span>${inStock} en stock sur ${items.length}</span></div>`;
    html += items.map(p => {
      const qn = stockOf(p.n, curSite);
      return `<div class="item ${qn ? "" : "zero"}"><div class="item-name"><b>${esc(p.n)}</b><small>${qn ? "En stock" : "Épuisé"}</small></div>
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
function ordersOf(day) { return Object.entries(data.reservations).filter(([, r]) => r && r.date === day); }
function renderAgenda() {
  const end = new Date(weekStart); end.setDate(end.getDate() + 6);
  $("week-label").textContent = weekStart.getMonth() === end.getMonth()
    ? weekStart.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
    : `${weekStart.toLocaleDateString("fr-FR", { month: "short" })} – ${end.toLocaleDateString("fr-FR", { month: "short", year: "numeric" })}`;
  const today = isoDay(new Date());
  let w = "";
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart); d.setDate(d.getDate() + i);
    const key = isoDay(d), nb = ordersOf(key).length;
    w += `<button type="button" class="day ${key === today ? "today" : ""}" data-day="${key}" aria-pressed="${key === selDate}" aria-label="${d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}, ${nb} commande${nb > 1 ? "s" : ""}">
      <span class="l">${d.toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "")}</span><span class="n">${d.getDate()}</span><span class="c">${nb ? nb + " cmd" : ""}</span></button>`;
  }
  $("week").innerHTML = w;
  const res = ordersOf(selDate).sort((a, b) => (a[1].done === b[1].done ? 0 : a[1].done ? 1 : -1));
  const dd = parseDay(selDate).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  let html = `<div class="day-title"><h2>${dd.charAt(0).toUpperCase() + dd.slice(1)}</h2><span>${res.length} commande${res.length > 1 ? "s" : ""}</span></div>`;
  if (res.length) {
    html += `<div class="recap">` + Object.keys(SITES).map(site => {
      const c = {};
      res.filter(([, r]) => r.boutique === site).forEach(([, r]) => { const k = typeLabel(r); c[k] = (c[k] || 0) + 1; });
      const txt = Object.entries(c).map(([k, n]) => `${n} × ${k}`).join(" · ") || "Rien";
      return `<div><b class="s-${site}">${SITES[site]}</b><span>${esc(txt)}</span></div>`;
    }).join("") + `</div>`;
    html += res.map(([id, r]) => {
      const tel = (r.tel || "").trim();
      return `<div class="order ${r.done ? "done" : ""}"><div class="bar ${esc(r.boutique)}"></div>
        <div class="order-main"><div class="who"><b>${esc(r.client || "Client inconnu")}</b><span class="pill">${esc(typeLabel(r))}</span></div>
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
  const st = { boutique: r.boutique || "st-selve", type: r.type || "Retrait libre", prix: r.prix || "20€", confirmDel: false };
  const sheet = openSheet(id ? "Modifier la commande" : "Nouvelle commande", "");
  const draw = () => {
    sheet.body.innerHTML = `
      <div class="field">Boutique<div class="seg" role="group" aria-label="Boutique">${Object.entries(SITES).map(([k, v]) => `<button type="button" data-b="${k}" aria-pressed="${st.boutique === k}">${v}</button>`).join("")}</div></div>
      <div class="field">Type de commande<div class="pick">${TYPES.map(([k, v]) => `<button type="button" data-t="${esc(k)}" aria-pressed="${st.type === k}">${v}</button>`).join("")}</div>
        ${st.type === "Panier" ? `<div class="pick" aria-label="Budget">${PRIX.map(p => `<button type="button" data-p="${p}" aria-pressed="${st.prix === p}">${p.replace("€", " €")}</button>`).join("")}</div>` : ""}</div>
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
    $("f-save").onclick = () => {
      keep();
      if (!r.client.trim()) { $("f-err").textContent = "Saisissez le nom du client."; $("f-client").focus(); return; }
      if (!r.date) { $("f-err").textContent = "Choisissez la date de retrait."; return; }
      const rec = { date: r.date, boutique: st.boutique, type: st.type, prix: st.type === "Panier" ? st.prix : "", client: r.client.trim(), tel: r.tel.trim(), desc: r.desc.trim(), done: !!r.done };
      if (id) db.ref("reservations/" + id).set(rec); else db.ref("reservations").push(rec);
      selDate = r.date; weekStart = mondayOf(parseDay(r.date));
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
function askCode() {
  const s = openSheet("Accès admin", `<label class="field">Code admin<input id="code-in" type="password" autocomplete="current-password" inputmode="text"></label><p class="err" id="code-err" role="alert"></p><button type="button" class="btn main wide" id="code-ok">Entrer</button>`);
  const ok = () => {
    if ($("code-in").value === MON_CODE) { try { localStorage.setItem("adminSession", Date.now()); } catch (e) {} s.close(); go("admin"); }
    else { $("code-err").textContent = "Code incorrect."; $("code-in").select(); }
  };
  $("code-ok").onclick = ok; $("code-in").onkeydown = e => { if (e.key === "Enter") ok(); };
  setTimeout(() => $("code-in").focus(), 50);
}

/* ---------- admin ---------- */
function backupList() { return Object.entries(data.sauvegardes).filter(([, b]) => b && b.stocks).sort((a, b) => b[0].localeCompare(a[0])); }
const backupLabel = key => { const d = parseDay(key); const t = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" }); return t.charAt(0).toUpperCase() + t.slice(1) + " · minuit"; };
function renderAdmin() {
  const bk = backupList(), shown = showAllBackups ? bk : bk.slice(0, 3);
  $("backups").innerHTML = shown.length ? shown.map(([k]) => `<div class="backup"><span>${esc(backupLabel(k))}</span>
      <button type="button" class="btn" data-bpdf="${esc(k)}">PDF</button><button type="button" class="btn dark" data-brest="${esc(k)}">Restaurer</button></div>`).join("")
    + (bk.length > 3 ? `<button type="button" class="link" id="more-backups">${showAllBackups ? "Afficher moins" : `Voir les ${bk.length - 3} sauvegardes précédentes`}</button>` : "")
    : `<p class="empty" style="padding:6px 0">La première sauvegarde sera faite ce soir à minuit (mardi, jeudi, vendredi et samedi).</p>`;
  $("new-cat").innerHTML = CATS.map(c => `<button type="button" data-nc="${esc(c)}" aria-pressed="${newCat === c}">${esc(c === "Panier de la semaine" ? "Panier" : c)}</button>`).join("");
  $("cat-count").textContent = `${data.products.length} produits`;
  $("catalogue").innerHTML = data.products.map(p => `<div class="cat-row"><b>${esc(p.n)}</b><small>${esc(p.c)}</small>
      <button type="button" data-del="${esc(p.n)}" aria-label="Supprimer ${esc(p.n)}">${icon.trash}</button></div>`).join("");
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
  confirmSheet("Remettre tout à zéro ?", "Toutes les quantités des deux boutiques passeront à 0. La dernière sauvegarde de minuit permet de revenir en arrière.", "Tout remettre à zéro", () => {
    const r = {}; data.products.forEach(p => { r[p.n] = { "st-selve": 0, "villenave": 0 }; });
    db.ref("stocks").set(r); toast("Quantités remises à zéro");
  });
}
function restoreBackup(k) {
  confirmSheet("Restaurer cette sauvegarde ?", `Les quantités actuelles des deux boutiques seront remplacées par celles du ${backupLabel(k).toLowerCase()}.`, "Restaurer", () => {
    db.ref("stocks").set(data.sauvegardes[k].stocks); toast("Sauvegarde restaurée");
  });
}
function generatePDF(stocks, titre, fichier) {
  stocks = stocks || data.stocks;
  const { jsPDF } = window.jspdf; const doc = new jsPDF();
  doc.setFontSize(18); doc.setTextColor(182, 17, 92); doc.text(titre || "INVENTAIRE PAYET PRIMEUR", 14, 20);
  const cat = Object.fromEntries(data.products.map(p => [p.n, p.c]));
  const rows = Object.entries(stocks).filter(([, s]) => s && ((s["st-selve"] || 0) > 0 || (s["villenave"] || 0) > 0))
    .map(([n, s]) => [cat[n] || "", n, s["st-selve"] || 0, s["villenave"] || 0, (s["st-selve"] || 0) + (s["villenave"] || 0), ""])
    .sort((a, b) => a[0] === b[0] ? a[1].localeCompare(b[1], "fr") : a[0].localeCompare(b[0], "fr"));
  doc.autoTable({ head: [["Cat.", "Produit", "St Selve", "Vill.", "Total", "Check"]], body: rows, startY: 30, headStyles: { fillColor: [182, 17, 92] } });
  doc.save(fichier || "Inventaire_Stock.pdf");
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
  else if (ds.del) delProd(ds.del);
  else if (ds.brest) restoreBackup(ds.brest);
  else if (ds.bpdf) generatePDF(data.sauvegardes[ds.bpdf].stocks, `SAUVEGARDE DU ${backupLabel(ds.bpdf).toUpperCase()}`, `Sauvegarde_stock_${ds.bpdf}.pdf`);
  else if (t.id === "more-backups") { showAllBackups = !showAllBackups; renderAdmin(); }
});
$("search").addEventListener("input", e => { query = e.target.value; renderStock(); });
$("prev-week").onclick = () => { weekStart.setDate(weekStart.getDate() - 7); renderAgenda(); };
$("next-week").onclick = () => { weekStart.setDate(weekStart.getDate() + 7); renderAgenda(); };
$("today-btn").onclick = () => { selDate = isoDay(new Date()); weekStart = mondayOf(new Date()); renderAgenda(); };
$("fab").onclick = () => orderSheet(null);
$("pdf-btn").onclick = () => generatePDF();
$("pdf-btn-2").onclick = () => generatePDF();
$("reset-btn").onclick = resetStocks;
$("qr-btn").onclick = () => window.openQrPanel && openQrPanel();
$("add-btn").onclick = addProduct;
$("new-p-name").onkeydown = e => { if (e.key === "Enter") addProduct(); };
document.addEventListener("keydown", e => { if (e.key === "Escape") { const s = document.querySelectorAll(".sheet-bg"); if (s.length) s[s.length - 1].querySelector(".sheet-head button").click(); } });
go("stock");
