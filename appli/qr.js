/* Module « QR codes & recettes » — Payet Primeur Pro
 * Le catalogue de l'appli est la seule liste : le site des recettes (payetprimeur.github.io)
 * se met à jour tout seul à partir de lui, environ toutes les heures.
 * Données Firebase utilisées :
 *   products[i] = { n, c, id, page, actif, titre? }   (id = adresse du QR, page = page recette)
 *   paniers/<id> = { contenu: [[nom, quantité], ...], maj }
 */
(function () {
  const SITE = "https://payetprimeur.github.io";
  const CAT_PANIER = "Panier de la semaine";
  const CATS_RECETTE = ["Fruit", "Légume", "Aromate"];
  const TABS = [["Fruit", "Fruits"], ["Légume", "Légumes"], ["Aromate", "Aromates"], ["Épicerie", "Épicerie"], [CAT_PANIER, "Paniers de la semaine"]];

  let open = false, tab = "Fruit", etat = null, editId = null, confirmDel = null, msgText = "";
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const slugify = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/œ/g, "oe").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "produit";
  const prods = () => data.products;
  const byId = id => prods().find(p => p.id === id);
  const paniers = () => data.paniers || {};
  const saveProducts = () => db.ref("products").set(prods());
  const say = t => { msgText = t; const el = $("qr-msg"); if (el) el.textContent = t; };

  /* ---------- identifiants (adresse du QR) ---------- */
  function uniqueId(base, taken) {
    let id = base, k = 2;
    while (taken.has(id)) id = `${base}-${k++}`;
    return id;
  }
  function fieldsFor(n, c) {
    const taken = new Set(prods().map(p => p.id).filter(Boolean));
    if (c === CAT_PANIER) {
      const base = slugify(n).startsWith("panier") ? slugify(n) : "panier-" + slugify(n);
      return { id: uniqueId(base, taken), page: null, actif: true };
    }
    const id = uniqueId(slugify(n), taken);
    return { id, page: CATS_RECETTE.includes(c) ? id : null, actif: true };
  }
  // utilisé par « Ajouter au catalogue » de l'admin
  window.QR = { fieldsFor, onData: () => { if (open) render(); } };

  /* ---------- reprise des données existantes (une seule fois) ---------- */
  async function migrate() {
    if (!window.QR_DATA_OK || prods().length < 5) return 0; // catalogue pas encore chargé : on ne touche à rien
    const L = window.QR_LIENS || { table: {}, renames: {} };
    let changed = 0;
    const stockMoves = [];
    for (const p of prods()) {
      if (L.renames[p.n] && !prods().some(q => q.n === L.renames[p.n])) {
        stockMoves.push([p.n, L.renames[p.n]]); p.n = L.renames[p.n]; changed++;
      }
    }
    const taken = new Set(prods().map(p => p.id).filter(Boolean));
    for (const p of prods()) {
      if (p.id) continue;
      const t = L.table[p.n];
      if (t && !taken.has(t[0])) { p.id = t[0]; p.page = t[1]; p.actif = t[2]; }
      else if (t) { p.id = uniqueId(t[0], taken); p.page = t[1]; p.actif = t[2]; } // doublon dans le catalogue : même page recette
      else Object.assign(p, fieldsFor(p.n, p.c));
      taken.add(p.id); changed++;
    }
    if (!prods().some(p => p.c === CAT_PANIER)) {
      prods().push({ n: "Panier de la semaine", c: CAT_PANIER, id: "panier", page: null, actif: true }); changed++;
    }
    if (!changed) return 0;
    for (const [a, b] of stockMoves) {
      if (data.stocks[a]) { await db.ref("stocks/" + b).set(data.stocks[a]); await db.ref("stocks/" + a).remove(); }
    }
    await saveProducts();
    return changed;
  }

  /* ---------- état du site (recettes prêtes ou en préparation) ---------- */
  async function loadEtat() {
    try {
      const r = await fetch(`${SITE}/etat.json?t=${Date.now()}`, { cache: "no-store" });
      if (r.ok) etat = await r.json();
    } catch (e) { etat = null; }
    if (open) render();
  }
  function stateOf(p) {
    if (!p.page) return null;
    if (!p.actif) return ["", ""];
    const s = etat && etat.pages && etat.pages[p.page];
    if (!s || s.attente) return ["En préparation (dans l'heure)", ""];
    return [s.type === "fruit" ? "Fiche : bien choisir et conserver" : `Recette : ${s.titre}`, "ok"];
  }
  function basketState(p) {
    const b = paniers()[p.id], contenu = (b && b.contenu) || [];
    if (!contenu.length) return ["Panier vide", ""];
    const s = etat && etat.paniers && etat.paniers[p.id];
    if (s && s.pret && JSON.stringify(s.contenu) === JSON.stringify(contenu)) return ["Recettes prêtes", "ok"];
    return ["Recettes en préparation (dans l'heure)", ""];
  }

  /* ---------- étiquettes ---------- */
  let libs = null;
  function loadScript(src) {
    return new Promise((ok, ko) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = ko; document.head.appendChild(s); });
  }
  function ensureLibs() {
    if (!libs) libs = Promise.all([
      window.qrcode ? null : loadScript("https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js"),
      new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = "logo-payet.png"; })
    ]).then(([, logo]) => logo);
    return libs;
  }
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  // impression noir et blanc : niveaux de gris, et tout ce qui est foncé (QR code, cadre) passe en noir pur
  let noirBlanc = false; try { noirBlanc = localStorage.getItem("qrNB") === "1"; } catch (e) {}
  function enNB(c) {
    if (!noirBlanc) return c;
    const g = c.getContext("2d"), im = g.getImageData(0, 0, c.width, c.height), d = im.data;
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const v = l < 140 ? 0 : l > 235 ? 255 : l;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    g.putImageData(im, 0, 0); return c;
  }
  async function labelCanvas(id, k) {
    k = k || 1; // agrandissement (planche 4 par page) : même dessin, en plus haute définition
    const logo = await ensureLibs();
    const mm = v => Math.round(v / 25.4 * 300);
    const W = mm(40), H = mm(52);
    const c = document.createElement("canvas"); c.width = Math.round(W * k); c.height = Math.round(H * k);
    const g = c.getContext("2d"); g.scale(k, k);
    g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
    g.strokeStyle = "#b6115c"; g.lineWidth = 5; rr(g, 6, 6, W - 12, H - 12, 28); g.stroke();
    const lw = W - mm(8), lh = Math.round(logo.height * lw / logo.width);
    g.drawImage(logo, mm(4), mm(4), lw, lh);
    const qr = qrcode(0, "Q"); qr.addData(`${SITE}/${id}/`); qr.make();
    const n = qr.getModuleCount(), quiet = 3, qs = mm(32), cell = qs / (n + 2 * quiet);
    const qx = (W - qs) / 2, qy = mm(4) + lh + mm(3);
    g.fillStyle = "#690834";
    for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (qr.isDark(r, k))
      g.fillRect(Math.floor(qx + (k + quiet) * cell), Math.floor(qy + (r + quiet) * cell), Math.ceil(cell), Math.ceil(cell));
    g.fillStyle = "#f9b00f"; rr(g, (W - 70) / 2, H - mm(4.5), 70, 7, 3); g.fill();
    return enNB(c);
  }
  // carte « Merci de votre achat » d'un panier : 92 × 64 mm, logo, message et QR code fixe du panier
  async function basketCardCanvas(id) {
    const logo = await ensureLibs();
    try { await document.fonts.load("800 40px Figtree"); await document.fonts.load("600 20px Figtree"); } catch (e) {}
    const mm = v => Math.round(v / 25.4 * 300);
    const W = mm(92), H = mm(64);
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
    g.strokeStyle = "#b6115c"; g.lineWidth = mm(0.6); rr(g, mm(1), mm(1), W - mm(2), H - mm(2), mm(4)); g.stroke();
    // QR code à gauche
    const qr = qrcode(0, "Q"); qr.addData(`${SITE}/${id}/`); qr.make();
    const n = qr.getModuleCount(), quiet = 3, qs = mm(48), cell = qs / (n + 2 * quiet);
    const qx = mm(4), qy = (H - qs) / 2;
    g.fillStyle = "#690834";
    for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (qr.isDark(r, k))
      g.fillRect(Math.floor(qx + (k + quiet) * cell), Math.floor(qy + (r + quiet) * cell), Math.ceil(cell), Math.ceil(cell));
    // logo et message à droite
    const rx = qx + qs + mm(2), rw = W - rx - mm(5);
    const lw = rw, lh = Math.round(logo.height * lw / logo.width);
    g.drawImage(logo, rx, mm(9), lw, lh);
    g.fillStyle = "#690834"; g.textAlign = "center"; g.textBaseline = "top";
    g.font = `800 ${mm(5.2)}px Figtree, Helvetica, Arial, sans-serif`;
    const cx = rx + rw / 2; let y = mm(9) + lh + mm(5);
    ["Merci de", "votre achat !"].forEach(t => { g.fillText(t, cx, y); y += mm(6.2); });
    g.fillStyle = "#6b625a"; g.font = `600 ${mm(3)}px Figtree, Helvetica, Arial, sans-serif`; y += mm(2.5);
    ["Scannez le QR code", "pour vos 2 recettes", "de la semaine"].forEach(t => { g.fillText(t, cx, y); y += mm(3.9); });
    g.fillStyle = "#f9b00f"; rr(g, cx - mm(6), H - mm(7), mm(12), mm(1.6), mm(0.8)); g.fill();
    return enNB(c);
  }
  async function downloadBasketSheet(p) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const img = (await basketCardCanvas(p.id)).toDataURL("image/png");
    const CW = 92, CH = 64, GX = 6, GY = 6, x0 = (210 - (2 * CW + GX)) / 2, y0 = (297 - (4 * CH + 3 * GY)) / 2;
    for (let k = 0; k < 8; k++) doc.addImage(img, "PNG", x0 + (k % 2) * (CW + GX), y0 + Math.floor(k / 2) * (CH + GY), CW, CH, "carte", "FAST");
    saveFile(doc.output("blob"), `cartes-${p.id}${noirBlanc ? "-noir-et-blanc" : ""}.pdf`);
    say(`8 cartes « ${p.n} » prêtes à imprimer.`);
  }
  function download(blob, name) { saveFile(blob, name); }
  async function downloadLabel(p) {
    const c = await labelCanvas(p.id);
    c.toBlob(b => download(b, `etiquette-${p.id}.png`), "image/png");
    say(`Étiquette « ${p.n} » téléchargée.`);
  }
  async function downloadSheet() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const items = prods().filter(p => p.actif && (p.page || p.c === CAT_PANIER)).sort((a, b) => a.c === b.c ? a.n.localeCompare(b.n, "fr") : TABS.findIndex(t => t[0] === a.c) - TABS.findIndex(t => t[0] === b.c));
    // 6 étiquettes par page (2 × 3), 62 × 81 mm, mêmes proportions que l'étiquette de 40 × 52 mm
    const LW = 62, LH = 62 * 52 / 40, GX = 18, GY = 12, cols = 2, per = 6, x0 = (210 - (cols * LW + (cols - 1) * GX)) / 2;
    const clean = s => String(s).replace(/œ/g, "oe").replace(/[’]/g, "'");
    for (let i = 0; i < items.length; i++) {
      const k = i % per;
      if (i && !k) doc.addPage();
      if (!k) { doc.setFontSize(8); noirBlanc ? doc.setTextColor(60) : doc.setTextColor(122, 106, 95); doc.text(`Étiquettes Payet Primeur · page ${i / per + 1} · le nom sous chaque étiquette est à découper`, 105, 8, { align: "center" }); }
      const x = x0 + (k % cols) * (LW + GX), y = 14 + Math.floor(k / cols) * (LH + GY);
      doc.addImage((await labelCanvas(items[i].id, 1.6)).toDataURL("image/png"), "PNG", x, y, LW, LH, undefined, "FAST");
      doc.setFontSize(10); noirBlanc ? doc.setTextColor(0) : doc.setTextColor(58, 42, 34); doc.text(clean(items[i].n), x + LW / 2, y + LH + 5, { align: "center", maxWidth: LW });
    }
    saveFile(doc.output("blob"), noirBlanc ? "etiquettes-payet-primeur-noir-et-blanc.pdf" : "etiquettes-payet-primeur.pdf");
    say(`Planche de ${items.length} étiquettes téléchargée.`);
  }

  /* ---------- actions ---------- */
  async function renameProduct(id, newName, titre) {
    const p = byId(id), old = p.n;
    if (newName !== old) {
      if (prods().some(q => q !== p && q.n.toLowerCase() === newName.toLowerCase())) { say(`« ${newName} » existe déjà.`); return false; }
      if (/[.#$\[\]\/]/.test(newName)) { say("Le nom ne peut pas contenir . # $ [ ] /"); return false; }
      if (data.stocks[old]) { await db.ref("stocks/" + newName).set(data.stocks[old]); await db.ref("stocks/" + old).remove(); }
      for (const [bid, b] of Object.entries(paniers())) {
        if ((b.contenu || []).some(x => x[0] === old)) await db.ref(`paniers/${bid}/contenu`).set(b.contenu.map(x => x[0] === old ? [newName, x[1]] : x));
      }
      p.n = newName;
    }
    if (titre !== undefined) { if (titre) p.titre = titre; else delete p.titre; }
    await saveProducts();
    return true;
  }
  async function setContenu(id, contenu) {
    await db.ref(`paniers/${id}`).set({ contenu, maj: Date.now() });
  }

  /* ---------- affichage ---------- */
  function rowHtml(p) {
    const i = esc(p.id);
    if (editId === p.id) return `<li class="qr-row"><form class="qr-form" data-edit="${i}">
        <label>Nom du produit<input name="n" value="${esc(p.n)}" required></label>
        ${p.page ? `<label>Titre de la page (facultatif)<input name="t" value="${esc(p.titre || "")}" placeholder="${esc(p.n)}"></label>` : "<span></span>"}
        <div class="qr-actions"><button class="qr-btn main" type="submit">Valider</button><button class="qr-btn" type="button" data-cancel>Annuler</button></div>
      </form></li>`;
    const st = stateOf(p);
    return `<li class="qr-row ${p.actif ? "" : "off"}">
      <label class="qr-switch" title="En vente"><input type="checkbox" data-actif="${i}" ${p.actif ? "checked" : ""} aria-label="${esc(p.n)} en vente"><span></span></label>
      <div class="qr-name">${esc(p.n)}${p.titre ? `<small>Titre affiché : ${esc(p.titre)}</small>` : ""}
        ${p.c === "Épicerie" ? "<small>Ingrédient des recettes</small>" : ""}
        ${st && st[0] ? `<br><span class="qr-state ${st[1]}">${esc(st[0])}</span>` : ""}</div>
      <div class="qr-actions">
        <button class="qr-btn" type="button" data-rename="${i}">Renommer</button>
        ${p.page ? `<button class="qr-btn" type="button" data-label="${i}">Étiquette QR</button><a class="qr-btn" href="${SITE}/${p.page}/" target="_blank" rel="noopener">Voir la page</a>` : ""}
      </div></li>`;
  }

  function basketHtml(p) {
    const i = esc(p.id);
    const b = paniers()[p.id] || {}, contenu = b.contenu || [];
    const st = basketState(p);
    const options = ["Fruit", "Légume", "Aromate", "Épicerie"].map(c => {
      const ps = prods().filter(q => q.c === c && q.actif).sort((a, b) => a.n.localeCompare(b.n, "fr"));
      return ps.length ? `<optgroup label="${c}">${ps.map(q => `<option>${esc(q.n)}</option>`).join("")}</optgroup>` : "";
    }).join("");
    return `<div class="qr-card qr-basket">
      ${editId === p.id ? `<form class="qr-form" data-edit="${i}"><label>Nom du panier<input name="n" value="${esc(p.n)}" required></label><span></span>
          <div class="qr-actions"><button class="qr-btn main" type="submit">Valider</button><button class="qr-btn" type="button" data-cancel>Annuler</button></div></form>`
        : `<h3>${esc(p.n)}</h3>`}
      <span class="qr-state ${st[1]}">${esc(st[0])}</span>
      <div>${contenu.length ? contenu.map(([n, q], j) => `<div class="qr-brow"><b>${esc(n)}</b>
          <input class="qty" data-bq="${esc(p.id)}:${j}" value="${esc(q)}" placeholder="Quantité" aria-label="Quantité de ${esc(n)}">
          <button class="qr-btn" type="button" data-bdel="${esc(p.id)}:${j}">Retirer</button></div>`).join("")
        : `<p class="qr-help">Ajoutez les produits du panier et leur quantité. Deux vraies recettes au choix sont ensuite préparées dans l'heure : une rapide et une plus lente, sans aucun fruit.</p>`}</div>
      <form class="qr-form" data-badd="${esc(p.id)}">
        <label>Produit<select>${options}</select></label>
        <label>Quantité<input placeholder="Ex : 1 kg, 3 pièces"></label>
        <button class="qr-btn main" type="submit">Ajouter</button>
      </form>
      <div class="qr-actions">
        <button class="qr-btn main" type="button" data-bcards="${i}">Cartes « Merci » à imprimer (PDF, 8 par page)</button>
        <button class="qr-btn" type="button" data-label="${i}">Étiquette QR du panier</button>
        <a class="qr-btn" href="${SITE}/${esc(p.id)}/" target="_blank" rel="noopener">Voir la page</a>
        <button class="qr-btn" type="button" data-rename="${i}">Renommer</button>
        ${confirmDel === p.id ? `<button class="qr-btn danger" type="button" data-delok="${i}">Confirmer la suppression</button><button class="qr-btn" type="button" data-delno>Annuler</button>`
          : `<button class="qr-btn danger" type="button" data-del="${i}">Supprimer</button>`}
      </div></div>`;
  }

  function render() {
    const root = $("qr-panel");
    if (!root) return;
    const scroll = root.scrollTop;
    const counts = TABS.map(([c]) => { const all = prods().filter(p => p.c === c); return [all.filter(p => p.actif).length, all.length]; });
    const list = prods().filter(p => p.c === tab).sort((a, b) => a.n.localeCompare(b.n, "fr"));
    root.innerHTML = `
      <div class="qr-top"><h2>QR codes &amp; recettes</h2><button type="button" id="qr-close">Fermer</button></div>
      <div class="qr-body">
        <div class="qr-card">
          <p class="qr-help">Le site des recettes suit ce catalogue tout seul, en moins d'une heure : un produit désactivé disparaît du site, un nouveau produit reçoit sa recette (ou sa fiche, pour un fruit). Les recettes de légumes changent chaque dimanche.${etat && etat.maj ? ` Dernière mise à jour du site : ${new Date(etat.maj).toLocaleString("fr-FR", { weekday: "short", hour: "2-digit", minute: "2-digit" })}.` : ""}</p>
          <div class="qr-actions"><button class="qr-btn main" type="button" id="qr-sheet">Planche de toutes les étiquettes (PDF)</button><a class="qr-btn" href="${SITE}/" target="_blank" rel="noopener">Voir le site</a></div>
          <label class="qr-nb"><input type="checkbox" id="qr-nb"${noirBlanc ? " checked" : ""}> Impression noir et blanc (étiquettes, planche et cartes des paniers)</label>
          <p class="qr-msg" id="qr-msg" role="status">${esc(msgText)}</p>
        </div>
        <div class="qr-tabs" role="group" aria-label="Catégories">${TABS.map(([c, label], k) =>
          `<button type="button" data-tab="${esc(c)}" class="${tab === c ? "on" : ""}">${label} <span class="n">${c === CAT_PANIER ? counts[k][1] : counts[k][0] + "/" + counts[k][1]}</span></button>`).join("")}</div>
        ${tab === CAT_PANIER
          ? list.map(basketHtml).join("") + `<button class="qr-btn main" type="button" id="qr-newbasket">+ Nouveau panier</button>`
          : `<div class="qr-card"><ul class="qr-rows">${list.map(rowHtml).join("") || `<p class="qr-help">Aucun produit dans cette catégorie.</p>`}</ul>
             <p class="qr-help">${tab === "Épicerie" ? "Les produits d'épicerie n'ont pas de page : ils servent d'ingrédients dans les recettes quand ils sont en vente." : "Interrupteur : en vente ou non. Pour ajouter un produit, utilisez « Ajouter au catalogue » dans l'admin."}</p></div>`}
      </div>`;
    root.scrollTop = scroll;
    bind(root);
  }

  function bind(root) {
    $("qr-close").onclick = close;
    $("qr-nb").onchange = e => { noirBlanc = e.target.checked; try { localStorage.setItem("qrNB", noirBlanc ? "1" : "0"); } catch (err) {} say(noirBlanc ? "Les téléchargements sortiront en noir et blanc." : "Les téléchargements sortiront en couleur."); };
    $("qr-sheet").onclick = async e => { e.target.disabled = true; say("Préparation de la planche…"); try { await downloadSheet(); } catch (err) { say("La planche n'a pas pu être créée."); } e.target.disabled = false; };
    root.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => { tab = b.dataset.tab; editId = confirmDel = null; render(); });
    root.querySelectorAll("[data-actif]").forEach(cb => cb.onchange = () => { byId(cb.dataset.actif).actif = cb.checked; saveProducts(); say(cb.checked ? "Remis en vente." : "Retiré de la vente : sa page sera retirée du site dans l'heure."); });
    root.querySelectorAll("[data-rename]").forEach(b => b.onclick = () => { editId = b.dataset.rename; render(); });
    root.querySelectorAll("[data-cancel]").forEach(b => b.onclick = () => { editId = null; render(); });
    root.querySelectorAll("[data-edit]").forEach(f => f.onsubmit = async e => {
      e.preventDefault();
      const n = f.elements.n.value.trim().replace(/\s+/g, " "); if (!n) return;
      const t = f.elements.t ? f.elements.t.value.trim() : undefined;
      if (await renameProduct(f.dataset.edit, n, t)) { editId = null; say("Nom modifié."); render(); }
    });
    root.querySelectorAll("[data-bcards]").forEach(b => b.onclick = async () => { b.disabled = true; say("Préparation des cartes…"); try { await downloadBasketSheet(byId(b.dataset.bcards)); } catch (e) { say("Les cartes n'ont pas pu être créées."); } b.disabled = false; });
    root.querySelectorAll("[data-label]").forEach(b => b.onclick = async () => { b.disabled = true; try { await downloadLabel(byId(b.dataset.label)); } catch (e) { say("L'étiquette n'a pas pu être créée."); } b.disabled = false; });
    root.querySelectorAll("[data-bq]").forEach(inp => inp.onchange = () => {
      const [id, j] = inp.dataset.bq.split(":"); const c = (paniers()[id].contenu || []).map(x => x.slice());
      c[+j][1] = inp.value.trim(); setContenu(id, c);
    });
    root.querySelectorAll("[data-bdel]").forEach(b => b.onclick = () => {
      const [id, j] = b.dataset.bdel.split(":"); const c = (paniers()[id].contenu || []).filter((x, k) => k !== +j); setContenu(id, c);
    });
    root.querySelectorAll("[data-badd]").forEach(f => f.onsubmit = e => {
      e.preventDefault();
      const id = f.dataset.badd, n = f.querySelector("select").value, q = f.querySelector("input").value.trim();
      if (!n) return;
      const c = ((paniers()[id] || {}).contenu || []).map(x => x.slice()), ex = c.find(x => x[0] === n);
      if (ex) ex[1] = q || ex[1]; else c.push([n, q]);
      setContenu(id, c); say(`« ${n} » ajouté au panier.`);
    });
    root.querySelectorAll("[data-del]").forEach(b => b.onclick = () => { confirmDel = b.dataset.del; render(); });
    root.querySelectorAll("[data-delno]").forEach(b => b.onclick = () => { confirmDel = null; render(); });
    root.querySelectorAll("[data-delok]").forEach(b => b.onclick = async () => {
      const p = byId(b.dataset.delok); confirmDel = null;
      data.products = prods().filter(q => q !== p);
      await saveProducts(); await db.ref("paniers/" + p.id).remove(); await db.ref("stocks/" + p.n).remove();
      say(`Panier « ${p.n} » supprimé.`);
    });
    const nb = $("qr-newbasket");
    if (nb) nb.onclick = async () => {
      let k = prods().filter(p => p.c === CAT_PANIER).length + 1, n = `Panier ${k}`;
      while (prods().some(p => p.n === n)) n = `Panier ${++k}`;
      prods().push({ n, c: CAT_PANIER, ...fieldsFor(n, CAT_PANIER) });
      const np = prods().find(p => p.n === n); await saveProducts(); editId = np.id; render();
    };
  }

  async function openPanel() {
    let root = $("qr-panel");
    if (!root) { root = document.createElement("div"); root.id = "qr-panel"; root.className = "qr-panel"; root.setAttribute("role", "dialog"); root.setAttribute("aria-label", "QR codes et recettes"); document.body.appendChild(root); }
    root.hidden = false; open = true; document.body.style.overflow = "hidden";
    msgText = "";
    if (!window.QR_DATA_OK) { root.innerHTML = '<div class="qr-top"><h2>QR codes &amp; recettes</h2></div><div class="qr-body"><p class="qr-help">Chargement du catalogue…</p></div>'; await new Promise(r => { const t = setInterval(() => { if (window.QR_DATA_OK) { clearInterval(t); r(); } }, 200); }); }
    const n = await migrate();
    if (n) msgText = "Catalogue relié au site des recettes ✔";
    render(); loadEtat();
  }
  function close() { open = false; editId = confirmDel = null; const r = $("qr-panel"); if (r) r.hidden = true; document.body.style.overflow = ""; }
  window.openQrPanel = openPanel;
})();
