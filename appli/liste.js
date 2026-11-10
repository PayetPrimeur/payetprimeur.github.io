/* Liste à cocher — Payet Primeur Pro
   Reprend la dernière sauvegarde de minuit des stocks nécessaires, classée comme le PDF.
   Les coches sont partagées entre les téléphones (coches/<date de la sauvegarde>) et repartent
   à zéro toutes seules à chaque nouvelle sauvegarde. */
(function () {
  const st = { open: false, hideDone: false, key: null, coches: {}, ref: null };

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
  const q = (s, site) => { const v = Number(s && s[site]); return isFinite(v) && v > 0 ? v : 0; };
  const enc = n => n.replace(/[.#$\[\]\/]/g, "_");

  function render() {
    const root = $("liste-panel"); if (!root || !st.open) return;
    let h = `<header class="top"><div class="wrap top-row">
        <div><div class="eyebrow">Admin</div><h1>Liste du stock</h1></div>
        <button type="button" class="icon-btn" id="liste-close" aria-label="Fermer la liste"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12"/><path d="M18 6 6 18"/></svg></button>
      </div></header><div class="content li-body">`;
    if (typeof backupsOk !== "undefined" && !backupsOk) { root.innerHTML = h + `<p class="empty">Chargement…</p></div>`; return; }
    const k = latest(); follow(k);
    if (!k) { root.innerHTML = h + `<p class="empty">La liste apparaîtra après la première sauvegarde de minuit.</p></div>`; return; }
    const stocks = data.sauvegardes[k].stocks, cat = Object.fromEntries(data.products.map(p => [p.n, p.c]));
    const groups = {};
    Object.entries(stocks).forEach(([n, s]) => { const a = q(s, "st-selve"), b = q(s, "villenave"); if (a || b) (groups[cat[n] || "Autre"] = groups[cat[n] || "Autre"] || []).push({ n, a, b }); });
    const order = CATS.concat(Object.keys(groups).filter(c => !CATS.includes(c)));
    const all = Object.values(groups).flat(), done = all.filter(r => st.coches[enc(r.n)]).length;
    const pct = all.length ? Math.round(done / all.length * 100) : 0;
    h += `<div class="li-head card">
        <div class="card-head"><h2>${esc(backupLabel(k))}</h2><span>${done} / ${all.length} fait${done > 1 ? "s" : ""}</span></div>
        <div class="li-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Avancement"><span style="width:${pct}%"></span></div>
        <p class="li-note">Liste figée à la sauvegarde de minuit : elle se renouvelle toute seule à la prochaine sauvegarde. Les cases cochées se voient sur tous les téléphones.</p>
        <label class="li-toggle"><input type="checkbox" id="li-hide"${st.hideDone ? " checked" : ""}> Masquer ce qui est fait</label>
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
    h += `</div>`;
    const y = root.scrollTop; root.innerHTML = h; root.scrollTop = y;
  }

  function onClick(e) {
    const t = e.target.closest("button, input"); if (!t) return;
    if (t.id === "liste-close") return close();
    if (t.id === "li-hide") { st.hideDone = t.checked; return render(); }
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
    root.hidden = false; st.open = true; document.body.style.overflow = "hidden"; root.scrollTop = 0; render();
  }
  function close() { st.open = false; const r = $("liste-panel"); if (r) r.hidden = true; document.body.style.overflow = ""; }
  window.LISTE = { open, onData: () => { if (st.open) render(); } };
})();
