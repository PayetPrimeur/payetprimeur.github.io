/* Liste à cocher — Payet Primeur Pro
   Reprend la dernière sauvegarde de minuit des stocks nécessaires, classée comme le PDF.
   Les coches sont partagées entre les téléphones (coches/<date de la sauvegarde>) et repartent
   à zéro toutes seules à chaque nouvelle sauvegarde. */
(function () {
  const st = { open: false, hideDone: false, key: null, coches: {}, ref: null, manuel: null, mRef: null };

  function latest() {
    const ks = Object.keys(data.sauvegardes || {}).filter(k => data.sauvegardes[k] && data.sauvegardes[k].stocks).sort();
    return ks.length ? ks[ks.length - 1] : null;
  }
  function follow(k) {
    if (st.key === k) return;
    if (st.ref) st.ref.off();
    st.key = k; st.coches = {};
    if (!k) return;
    st.ref = db.ref("coches/" + k);
    st.ref.on("value", s => { st.coches = s.val() || {}; render(); });
  }
  // la liste vient de la dernière sauvegarde de minuit, ou d'une mise à jour manuelle plus récente
  // (liste/actuelle : ce n'est pas une sauvegarde, elle ne compte ni dans l'historique ni dans les stats)
  function source() {
    const k = latest(), M = st.manuel;
    const bLe = k ? (data.sauvegardes[k].le || k + "T00:00:00Z") : "";
    if (M && M.stocks && M.id && M.le > bLe) {
      const d = new Date(M.le);
      const t = d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }).replace(/\./g, "") + ` à ${d.getHours()} h ${String(d.getMinutes()).padStart(2, "0")}`;
      return { id: M.id, stocks: M.stocks, label: "Mise à jour " + t, manuel: true, jours: joursCouverts(M.jour, true) };
    }
    if (!k) return null;
    return { id: k, stocks: data.sauvegardes[k].stocks, label: backupLabel(k), manuel: false, jours: joursCouverts(k, false) };
  }
  function miseAJour() {
    const sh = openSheet("Mettre à jour la liste", `<p class="hint">La liste reprend tout de suite les stocks nécessaires actuels des deux boutiques, et les cases cochées repartent à zéro.</p>
      <p class="hint">Ce n'est pas une sauvegarde : la sauvegarde de minuit continue comme d'habitude et remplacera cette liste le soir venu.</p>
      <button type="button" class="btn main wide" id="li-maj-ok">Mettre à jour maintenant</button>`);
    $("li-maj-ok").onclick = () => {
      const now = new Date(), jour = isoDay(now);
      const id = `${jour}-m${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
      $("li-maj-ok").disabled = true;
      db.ref("liste/actuelle").set({ id, jour, le: now.toISOString(), stocks: data.stocks || {} })
        .then(() => { sh.close(); toast("Liste mise à jour"); })
        .catch(() => { $("li-maj-ok").disabled = false; toast("Échec de la mise à jour, réessayez."); });
    };
  }
  const q = (s, site) => { const v = Number(s && s[site]); return isFinite(v) && v > 0 ? v : 0; };
  const enc = n => n.replace(/[.#$\[\]\/]/g, "_");

  function render() {
    const root = $("liste-panel"); if (!root || !st.open) return;
    let h = `<header class="top"><div class="wrap top-row">
        <div><div class="eyebrow">Admin</div><h1>Liste du stock</h1></div>
        <button type="button" class="icon-btn" id="liste-close" aria-label="Fermer la liste"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12"/><path d="M18 6 6 18"/></svg></button>
      </div></header><div class="content li-body">`;
    if (typeof backupsOk !== "undefined" && !backupsOk) { root.innerHTML = h + `<p class="empty">Chargement…</p></div>`; return; }
    const S = source(); follow(S && S.id);
    const majBtn = `<button type="button" class="btn wide" id="li-maj">Mettre à jour avec les stocks actuels</button>`;
    if (!S) { root.innerHTML = h + `<p class="empty">La liste apparaîtra après la première sauvegarde de minuit.</p>${majBtn}</div>`; return; }
    const k = S.id, stocks = S.stocks, cat = Object.fromEntries(data.products.map(p => [p.n, p.c]));
    const groups = {};
    Object.entries(stocks).forEach(([n, s]) => { const a = q(s, "st-selve"), b = q(s, "villenave"); if (a || b) (groups[cat[n] || "Autre"] = groups[cat[n] || "Autre"] || []).push({ n, a, b }); });
    const order = CATS.concat(Object.keys(groups).filter(c => !CATS.includes(c)));
    const all = Object.values(groups).flat(), done = all.filter(r => st.coches[enc(r.n)]).length;
    const pct = all.length ? Math.round(done / all.length * 100) : 0;
    h += `<div class="li-head card">
        <div class="card-head"><h2>${esc(S.label)}</h2><span>${done} / ${all.length} fait${done > 1 ? "s" : ""}</span></div>
        <div class="li-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Avancement"><span style="width:${pct}%"></span></div>
        <p class="li-note">${S.manuel ? "Liste mise à jour à la main : la prochaine sauvegarde de minuit la remplacera." : "Liste figée à la sauvegarde de minuit : elle se renouvelle toute seule à la prochaine sauvegarde."} Les cases cochées se voient sur tous les téléphones.</p>
        <label class="li-toggle"><input type="checkbox" id="li-hide"${st.hideDone ? " checked" : ""}> Masquer ce qui est fait</label>
        ${majBtn}
      </div>`;
    if (!all.length) h += `<p class="empty">Rien à prévoir sur cette sauvegarde.</p>`;
    order.filter(c => groups[c]).forEach(c => {
      const rows = groups[c].sort((x, y) => x.n.localeCompare(y.n, "fr"));
      const nd = rows.filter(r => st.coches[enc(r.n)]).length;
      const shown = st.hideDone ? rows.filter(r => !st.coches[enc(r.n)]) : rows;
      h += `<section class="li-cat"><h2><span>${esc((CAT_LABEL[c] || c).toUpperCase())}</span><small>${nd} / ${rows.length}</small></h2>
        <div class="li-cols" aria-hidden="true"><span>Produit</span><span>St Selve</span><span>Villen.</span><span>Total</span></div>`;
      h += shown.length ? shown.map(r => { const ok = !!st.coches[enc(r.n)];
        return `<button type="button" class="li-row${ok ? " ok" : ""}" data-lp="${esc(r.n)}" aria-pressed="${ok}">
          <span class="li-box" aria-hidden="true">${ok ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg>' : ""}</span>
          <b>${esc(r.n)}</b><span>${r.a || "–"}</span><span>${r.b || "–"}</span><em>${r.a + r.b}</em></button>`; }).join("")
        : `<p class="li-alldone">Tout est fait dans cette catégorie.</p>`;
      h += `</section>`;
    });
    h += libres(S.jours);
    h += `</div>`;
    const y = root.scrollTop; root.innerHTML = h; root.scrollTop = y;
  }

  // jours couverts par cette liste : du lendemain de la sauvegarde jusqu'au soir de la prochaine sauvegarde
  // (sauvegardes les mardis, jeudis, vendredis et samedis soir)
  // avec memeJour (mise à jour manuelle), on commence le jour même
  function joursCouverts(k, memeJour) {
    const out = [], d = parseDay(k);
    if (memeJour) { out.push(isoDay(d)); if ([2, 4, 5, 6].includes(d.getDay())) return out; }
    for (let i = 0; i < 7; i++) {
      d.setDate(d.getDate() + 1); out.push(isoDay(d));
      if ([2, 4, 5, 6].includes(d.getDay())) break;
    }
    return out;
  }
  function libres(jours) {
    const list = Object.entries(data.reservations || {}).filter(([, r]) => r && r.type === "Retrait libre" && jours.includes(r.date))
      .sort((a, b) => a[1].date.localeCompare(b[1].date) || String(a[1].boutique).localeCompare(String(b[1].boutique)) || String(a[1].client).localeCompare(String(b[1].client), "fr"));
    const lab = d => { const t = parseDay(d).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" }); return t.charAt(0).toUpperCase() + t.slice(1); };
    const per = jours.length > 1 ? `du ${lab(jours[0]).toLowerCase()} au ${lab(jours[jours.length - 1]).toLowerCase()}` : lab(jours[0]).toLowerCase();
    const nd = list.filter(([id]) => st.coches["cmd-" + id]).length;
    let h = `<section class="li-cat"><h2><span>COMMANDES LIBRES</span><small>${nd} / ${list.length}</small></h2>
      <p class="li-sub">Retraits libres ${esc(per)}, jusqu'à la prochaine sauvegarde.</p>`;
    if (!list.length) return h + `<p class="li-alldone">Aucune commande libre sur ces jours.</p></section>`;
    let jour = "";
    list.forEach(([id, r]) => {
      if (st.hideDone && st.coches["cmd-" + id]) return;
      if (r.date !== jour) { jour = r.date; h += `<div class="li-day">${esc(lab(jour))}</div>`; }
      const ok = !!st.coches["cmd-" + id], nb = qtyOf(r);
      h += `<button type="button" class="li-row li-cmd${ok ? " ok" : ""}" data-lc="${esc(id)}" aria-pressed="${ok}">
        <span class="li-box" aria-hidden="true">${ok ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg>' : ""}</span>
        <span class="li-who"><b>${nb > 1 ? nb + " × " : ""}${esc(r.client || "Client inconnu")}</b>
          <small><i class="li-shop ${esc(r.boutique)}"></i>${esc(SITES[r.boutique] || "")}${r.tel ? " · " + esc(r.tel) : ""}</small>
          ${r.desc ? `<span class="li-desc">${esc(r.desc)}</span>` : ""}</span></button>`;
    });
    return h + `</section>`;
  }

  function onClick(e) {
    const t = e.target.closest("button, input"); if (!t) return;
    if (t.id === "liste-close") return close();
    if (t.id === "li-hide") { st.hideDone = t.checked; return render(); }
    if (t.id === "li-maj") return miseAJour();
    if (t.dataset.lc && st.key) {
      const k = "cmd-" + enc(t.dataset.lc), v = !st.coches[k];
      st.coches[k] = v; render();
      db.ref(`coches/${st.key}/${k}`).set(v ? true : null);
      return;
    }
    if (t.dataset.lp && st.key) {
      const k = enc(t.dataset.lp), v = !st.coches[k];
      st.coches[k] = v; render(); // affichage immédiat, la base suit
      db.ref(`coches/${st.key}/${k}`).set(v ? true : null);
    }
  }
  function open() {
    let root = $("liste-panel");
    if (!root) {
      root = document.createElement("div"); root.id = "liste-panel"; root.className = "stats-panel";
      root.setAttribute("role", "dialog"); root.setAttribute("aria-label", "Liste du stock à cocher"); document.body.appendChild(root);
      root.addEventListener("click", onClick);
      document.addEventListener("keydown", e => { if (e.key === "Escape" && st.open && !document.querySelector(".sheet-bg")) close(); });
    }
    if (!st.mRef) { st.mRef = db.ref("liste/actuelle"); st.mRef.on("value", s => { st.manuel = s.val(); render(); }); }
    root.hidden = false; st.open = true; document.body.style.overflow = "hidden"; root.scrollTop = 0; render();
  }
  function close() { st.open = false; const r = $("liste-panel"); if (r) r.hidden = true; document.body.style.overflow = ""; }
  window.LISTE = { open, onData: () => { if (st.open) render(); } };
})();
