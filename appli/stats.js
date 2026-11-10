/* Statistiques — Payet Primeur Pro
   Lit les sauvegardes de minuit (stocks nécessaires) et les commandes déjà chargées dans `data`. */
(function () {
  const SHOP_COL = { "st-selve": "#5a7827", "villenave": "#2f6fa8" };
  const PERIODES = [["28", "4 sem."], ["91", "3 mois"], ["365", "1 an"], ["tout", "Tout"]];
  const BOUT = [["tout", "Les deux"], ["st-selve", "St Selve"], ["villenave", "Villenave"]];
  const JOURS = ["Mardi", "Jeudi", "Vendredi", "Samedi"];
  const st = { open: false, pas: "soir", per: "91", shop: "tout", sort: "total", cat: "Tout", prod: null, showAll: false };

  const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
  const n0 = v => nf.format(Math.round(v * 10) / 10);
  const shortDate = k => parseDay(k).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }).replace(/\./g, "");
  const longDate = k => { const t = parseDay(k).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }); return t.charAt(0).toUpperCase() + t.slice(1); };
  const shops = () => st.shop === "tout" ? Object.keys(SITES) : [st.shop];
  const val = (s, site) => { const v = Number(s && s[site]); return isFinite(v) && v > 0 ? v : 0; };
  const catOf = (() => { let m = null, src = null; return n => { if (src !== data.products) { src = data.products; m = {}; data.products.forEach(p => m[p.n] = p.c); } return m[n] || "Autre"; }; })();

  function since() {
    if (st.per === "tout") return "0000";
    const d = new Date(); d.setDate(d.getDate() - Number(st.per)); return isoDay(d);
  }
  function backups() {
    const from = since();
    return Object.entries(data.sauvegardes || {}).filter(([k, b]) => b && b.stocks && k >= from).sort((a, b) => a[0].localeCompare(b[0]));
  }

  /* ---------- calculs ---------- */
  function compute() {
    const bk = backups(), sh = shops();
    const series = bk.map(([k, b]) => {
      const per = {}; let nbProd = 0;
      sh.forEach(site => per[site] = 0);
      Object.values(b.stocks).forEach(s => { let any = false; sh.forEach(site => { const v = val(s, site); per[site] += v; if (v) any = true; }); if (any) nbProd++; });
      return { k, per, total: sh.reduce((a, site) => a + per[site], 0), nbProd };
    });
    const prods = {};
    bk.forEach(([k, b]) => Object.entries(b.stocks).forEach(([n, s]) => {
      const v = sh.reduce((a, site) => a + val(s, site), 0);
      const p = prods[n] || (prods[n] = { n, c: catOf(n), total: 0, fois: 0, max: 0, last: 0 });
      p.total += v; if (v) p.fois++; if (v > p.max) p.max = v;
    }));
    if (bk.length) { const lastS = bk[bk.length - 1][1].stocks; Object.values(prods).forEach(p => p.last = sh.reduce((a, site) => a + val(lastS[p.n], site), 0)); }
    const cats = {};
    Object.values(prods).forEach(p => { cats[p.c] = (cats[p.c] || 0) + p.total; });
    const jours = JOURS.map(j => ({ j, tot: 0, n: 0 }));
    series.forEach(s => {
      // sauvegarde de minuit datée du soir : mardi soir → commande pour le mercredi, etc.
      const i = { 2: 0, 4: 1, 5: 2, 6: 3 }[parseDay(s.k).getDay()];
      if (i !== undefined) { jours[i].tot += s.total; jours[i].n++; }
    });
    // commandes
    const from = since();
    const ords = Object.values(data.reservations || {}).filter(r => r && r.date && r.date >= from && sh.includes(r.boutique));
    const byMonth = types => { const out = {}, list = ords.filter(r => types.includes(r.type));
      list.forEach(r => { const m = r.date.slice(0, 7); const o = out[m] || (out[m] = {}); o[r.boutique] = (o[r.boutique] || 0) + qtyOf(r); });
      return { months: out, nb: list.reduce((a, r) => a + qtyOf(r), 0) }; };
    const paniers = byMonth(["Panier", "Panier Garni"]), plateaux = byMonth(["Plateau"]);
    const types = {};
    ords.forEach(r => { const t = typeLabel(r); types[t] = (types[t] || 0) + qtyOf(r); });
    return { bk, sh, series, prods: Object.values(prods), cats, jours, ords, paniers, plateaux, types };
  }

  /* ---------- graphiques (HTML + SVG, sans librairie) ---------- */
  function niceMax(v) { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); const f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; }

  // barres verticales empilées par boutique ; chaque barre est un bouton qui affiche son détail
  function vbars(id, items, sh, unit) {
    if (!items.length) return `<p class="st-empty">Pas encore de données sur cette période.</p>`;
    const max = niceMax(Math.max(...items.map(it => sh.reduce((a, s) => a + (it.per[s] || 0), 0))));
    const H = 140;
    const bars = items.map((it, i) => {
      const tot = sh.reduce((a, s) => a + (it.per[s] || 0), 0);
      let y = 0;
      const segs = sh.map(s => { const h = (it.per[s] || 0) / max * H; const seg = h > 0 ? `<span class="st-seg" style="height:${h}px;background:${SHOP_COL[s]}"></span>` : ""; y += h; return seg; }).reverse().join("");
      const det = sh.length > 1 ? " · " + sh.map(s => `${SITES[s]} ${n0(it.per[s] || 0)}`).join(" · ") : "";
      return `<button type="button" class="st-bar" data-tip="${esc(it.label + " : " + n0(tot) + " " + unit + det)}" aria-label="${esc(it.label + " : " + n0(tot) + " " + unit + det)}">${segs}</button>`;
    }).join("");
    const first = items[0].short, last = items[items.length - 1].short;
    return `<div class="st-chart" id="${id}">
      <p class="st-tip" aria-live="polite">Touchez une barre pour le détail</p>
      <div class="st-plot"><div class="st-grid"><span>${n0(max)}</span><span>${n0(max / 2)}</span><span>0</span></div>
        <div class="st-bars" style="height:${H}px">${bars}</div></div>
      <div class="st-axis"><span class="st-axw">${n0(max)}</span><div class="st-axl">${items.map((it, i) => `<span>${i === 0 ? `<em class="l">${esc(first)}</em>` : i === items.length - 1 ? `<em class="r">${esc(last)}</em>` : ""}</span>`).join("")}</div></div></div>`;
  }
  // barres horizontales classées (une seule couleur), étiquettes directes
  function hbars(rows, unit, clickable) {
    if (!rows.length) return `<p class="st-empty">Rien à afficher.</p>`;
    const max = Math.max(...rows.map(r => r.v)) || 1;
    return `<div class="st-hbars">` + rows.map(r => {
      const tag = clickable ? `button type="button" data-sprod="${esc(r.key)}"` : "div";
      return `<${tag} class="st-hrow"><span class="st-hl">${esc(r.label)}${r.sub ? `<small>${esc(r.sub)}</small>` : ""}</span>
        <span class="st-ht"><span class="st-hf" style="width:${Math.max(2, r.v / max * 100)}%;background:${r.col || "var(--primary)"}"></span></span>
        <b>${n0(r.v)}${unit ? " " + unit : ""}</b></${clickable ? "button" : "div"}>`;
    }).join("") + `</div>`;
  }
  // regroupe les sauvegardes par semaine (du lundi au dimanche) si besoin
  function parPas(items, sh) {
    if (st.pas !== "semaine") return items.map(it => ({ label: longDate(it.k), short: shortDate(it.k), per: it.per }));
    const w = {};
    items.forEach(it => { const m = isoDay(mondayOf(parseDay(it.k))); const g = w[m] || (w[m] = { per: {}, n: 0 }); g.n++; sh.forEach(s => g.per[s] = (g.per[s] || 0) + (it.per[s] || 0)); });
    return Object.keys(w).sort().map(m => { const d = parseDay(m).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }).replace(/\./g, "");
      return { label: `Semaine du ${d} (${w[m].n} soir${w[m].n > 1 ? "s" : ""})`, short: `sem. du ${d}`, per: w[m].per }; });
  }
  const pasCtl = () => `<div class="st-seg-ctl st-pas" role="group" aria-label="Affichage">${[["soir", "Par soir"], ["semaine", "Par semaine"]].map(([v, l]) => `<button type="button" data-spas="${v}" aria-pressed="${st.pas === v}">${l}</button>`).join("")}</div>`;
  const legend = sh => sh.length > 1 ? `<div class="st-leg">${sh.map(s => `<span><i style="background:${SHOP_COL[s]}"></i>${SITES[s]}</span>`).join("")}</div>` : "";

  /* ---------- rendu ---------- */
  function render() {
    const root = $("stats-panel"); if (!root) return;
    const C = compute(), { bk, sh, series } = C;
    const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
    const seg = (key, opts) => `<div class="st-seg-ctl" role="group">${opts.map(([v, l]) => `<button type="button" data-s${key}="${v}" aria-pressed="${st[key] === v}">${l}</button>`).join("")}</div>`;

    let h = `<header class="top st-top"><div class="wrap top-row">
        <div><div class="eyebrow">Admin</div><h1>Statistiques</h1></div>
        <button type="button" class="icon-btn" id="stats-close" aria-label="Fermer les statistiques"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12"/><path d="M18 6 6 18"/></svg></button>
      </div><div class="wrap st-filters">${seg("per", PERIODES)}${seg("shop", BOUT)}</div></header>
      <div class="content st-body">`;

    if (typeof backupsOk !== "undefined" && !backupsOk) {
      h += `<section class="card"><p class="st-note">Chargement des sauvegardes…</p></section>`;
    } else if (!bk.length) {
      h += `<section class="card"><h2>Pas encore de sauvegarde sur cette période</h2><p class="st-note">Les stocks nécessaires sont sauvegardés à minuit les mardis, jeudis, vendredis et samedis soir. Les statistiques se remplissent au fil des sauvegardes.</p></section>`;
    } else {
      const last = series[series.length - 1];
      h += `<p class="st-note st-range">${bk.length} sauvegarde${bk.length > 1 ? "s" : ""}, du ${shortDate(bk[0][0])} au ${shortDate(last.k)}</p><div class="st-kpis">
        <div class="st-kpi"><small>Produits à prévoir</small><b>${n0(avg(series.map(s => s.nbProd)))}</b><span>en moyenne par soir</span></div>
        <div class="st-kpi"><small>Quantités à prévoir</small><b>${n0(avg(series.map(s => s.total)))}</b><span>en moyenne par soir</span></div>
        <div class="st-kpi"><small>Paniers commandés</small><b>${C.paniers.nb}</b><span>sur la période</span></div>
        <div class="st-kpi"><small>Plateaux commandés</small><b>${C.plateaux.nb}</b><span>sur la période</span></div>
      </div>`;

      h += `<section class="card"><div class="card-head"><h2>Quantités à prévoir</h2>${legend(sh)}</div>${pasCtl()}
        ${vbars("st-evo", parPas(series.map(s => ({ k: s.k, per: s.per })), sh), sh, "")}
        <p class="st-note">Somme de toutes les quantités notées dans l'appli à minuit (pièces, kilos et colis confondus) : utile pour voir les tendances, pas comme un volume exact.</p></section>`;

      const jr = C.jours.filter(j => j.n);
      h += `<section class="card"><div class="card-head"><h2>Selon le soir</h2><span>moyenne des quantités à prévoir</span></div>
        ${hbars(jr.map(j => ({ label: j.j + " soir", sub: `${j.n} sauvegarde${j.n > 1 ? "s" : ""}`, v: j.tot / j.n })), "", false)}</section>`;

      const cr = Object.entries(C.cats).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
      h += `<section class="card"><div class="card-head"><h2>Par catégorie</h2><span>total sur la période</span></div>
        ${hbars(cr.map(([c, v]) => ({ label: CAT_LABEL[c] || c, v })), "", false)}</section>`;

      const top = C.prods.filter(p => p.total > 0).sort((a, b) => b.total - a.total).slice(0, 10);
      h += `<section class="card"><div class="card-head"><h2>Les 10 produits les plus à prévoir</h2><span>touchez pour le détail</span></div>
        ${hbars(top.map(p => ({ key: p.n, label: p.n, sub: `à prévoir ${p.fois} soir${p.fois > 1 ? "s" : ""} sur ${bk.length}`, v: p.total })), "", true)}</section>`;
    }

    // commandes : paniers et plateaux séparés
    const moisChart = (id, M, unit) => vbars(id, Object.keys(M).sort().map(m => { const d = new Date(m + "-01T12:00:00"); const l = d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }); return { label: l.charAt(0).toUpperCase() + l.slice(1), short: d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" }), per: M[m] }; }), sh, unit);
    const tr = Object.entries(C.types).sort((a, b) => b[1] - a[1]);
    h += `<section class="card"><div class="card-head"><h2>Paniers commandés par mois</h2>${legend(sh)}</div>
      ${moisChart("st-pan", C.paniers.months, "panier(s)")}<p class="st-note">Paniers et paniers garnis, en quantité.</p></section>`;
    h += `<section class="card"><div class="card-head"><h2>Plateaux commandés par mois</h2>${legend(sh)}</div>
      ${moisChart("st-pla", C.plateaux.months, "plateau(x)")}</section>`;
    if (tr.length) h += `<section class="card"><div class="card-head"><h2>Commandes par type</h2><span>en quantité</span></div>
      ${hbars(tr.map(([t, v]) => ({ label: t, v })), "", false)}</section>`;

    // vue précise : un produit
    if (bk.length) {
      const names = [...new Set(bk.flatMap(([, b]) => Object.keys(b.stocks)))].sort((a, b) => a.localeCompare(b, "fr"));
      if (!st.prod || !names.includes(st.prod)) st.prod = (C.prods.filter(p => p.total > 0).sort((a, b) => b.total - a.total)[0] || {}).n || names[0];
      const P = C.prods.find(p => p.n === st.prod) || { total: 0, fois: 0, max: 0, last: 0 };
      const opts = CATS.concat(["Autre"]).map(c => { const ns = names.filter(n => catOf(n) === c); return ns.length ? `<optgroup label="${esc(CAT_LABEL[c] || c)}">${ns.map(n => `<option${n === st.prod ? " selected" : ""}>${esc(n)}</option>`).join("")}</optgroup>` : ""; }).join("");
      h += `<section class="card" id="st-detail"><div class="card-head"><h2>Vue précise d'un produit</h2></div>
        <label class="field">Produit<select id="st-prod">${opts}</select></label>
        <div class="st-kpis small">
          <div class="st-kpi"><small>À prévoir</small><b>${P.fois}<em>/${bk.length}</em></b><span>soirs</span></div>
          <div class="st-kpi"><small>Moyenne</small><b>${n0(P.fois ? P.total / P.fois : 0)}</b><span>quand il est à prévoir</span></div>
          <div class="st-kpi"><small>Maximum</small><b>${n0(P.max)}</b><span>en un soir</span></div>
          <div class="st-kpi"><small>Dernier soir</small><b>${n0(P.last)}</b><span>${shortDate(bk[bk.length - 1][0])}</span></div>
        </div>
        <div class="card-head"><h3 class="st-h3">Historique</h3>${legend(sh)}</div>${pasCtl()}
        ${vbars("st-prodchart", parPas(bk.map(([k, b]) => { const per = {}; sh.forEach(s => per[s] = val(b.stocks[st.prod], s)); return { k, per }; }), sh), sh, "")}
      </section>`;

      // tableau complet
      const catsPresent = ["Tout"].concat(CATS.concat(["Autre"]).filter(c => C.prods.some(p => p.c === c)));
      if (!catsPresent.includes(st.cat)) st.cat = "Tout";
      let rows = C.prods.filter(p => st.cat === "Tout" || p.c === st.cat);
      const key = { total: p => -p.total, fois: p => -p.fois, moy: p => -(p.fois ? p.total / p.fois : 0), max: p => -p.max, nom: null }[st.sort];
      rows.sort((a, b) => key ? key(a) - key(b) || a.n.localeCompare(b.n, "fr") : a.n.localeCompare(b.n, "fr"));
      const shown = st.showAll ? rows : rows.slice(0, 25);
      const th = (k, l) => `<th scope="col"><button type="button" data-ssort="${k}" aria-pressed="${st.sort === k}">${l}${st.sort === k ? " ↓" : ""}</button></th>`;
      h += `<section class="card"><div class="card-head"><h2>Tous les produits</h2><span>${rows.length} produit${rows.length > 1 ? "s" : ""}</span></div>
        <div class="chips st-chips">${catsPresent.map(c => `<button type="button" class="chip ${c === "Tout" ? "c-tout" : "c-" + c.replace(/ /g, "-")}" style="${c === "Autre" ? "background:var(--muted)" : ""}" data-scat="${esc(c)}" aria-pressed="${st.cat === c}">${esc(c === "Tout" ? "Tout" : CAT_LABEL[c] || c)}</button>`).join("")}</div>
        <div class="st-table-wrap"><table class="st-table"><thead><tr>${th("nom", "Produit")}${th("fois", "Soirs")}${th("moy", "Moy.")}${th("max", "Max")}${th("total", "Total")}</tr></thead>
        <tbody>${shown.map(p => `<tr data-sprod="${esc(p.n)}"><th scope="row">${esc(p.n)}</th><td>${p.fois}</td><td>${n0(p.fois ? p.total / p.fois : 0)}</td><td>${n0(p.max)}</td><td><b>${n0(p.total)}</b></td></tr>`).join("")}</tbody></table></div>
        ${rows.length > 25 ? `<button type="button" class="link" id="st-more">${st.showAll ? "Afficher moins" : `Afficher les ${rows.length - 25} autres`}</button>` : ""}
        <p class="st-note">Soirs : nombre de sauvegardes où le produit était à prévoir. Moy. : quantité moyenne ces soirs-là. Touchez une ligne pour sa vue précise.</p></section>`;
    }
    h += `</div>`;
    const y = root.scrollTop; root.innerHTML = h; root.scrollTop = y;
  }

  /* ---------- interactions ---------- */
  function onClick(e) {
    const t = e.target.closest("button, tr[data-sprod]"); if (!t) return;
    const ds = t.dataset;
    if (t.id === "stats-close") return close();
    if (ds.sper) { st.per = ds.sper; return render(); }
    if (ds.sshop) { st.shop = ds.sshop; return render(); }
    if (ds.spas) { st.pas = ds.spas; return render(); }
    if (ds.ssort) { st.sort = ds.ssort; return render(); }
    if (ds.scat) { st.cat = ds.scat; st.showAll = false; return render(); }
    if (t.id === "st-more") { st.showAll = !st.showAll; return render(); }
    if (ds.sprod) { st.prod = ds.sprod; render(); const d = $("st-detail"); if (d) d.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    if (ds.tip) showTip(t);
  }
  function showTip(b) {
    const chart = b.closest(".st-chart"); if (!chart) return;
    chart.querySelectorAll(".st-bar.on").forEach(x => x.classList.remove("on"));
    b.classList.add("on"); chart.querySelector(".st-tip").textContent = b.dataset.tip;
  }
  function open() {
    let root = $("stats-panel");
    if (!root) {
      root = document.createElement("div"); root.id = "stats-panel"; root.className = "stats-panel";
      root.setAttribute("role", "dialog"); root.setAttribute("aria-label", "Statistiques"); document.body.appendChild(root);
      root.addEventListener("click", onClick);
      root.addEventListener("mouseover", e => { const b = e.target.closest(".st-bar"); if (b) showTip(b); });
      root.addEventListener("change", e => { if (e.target.id === "st-prod") { st.prod = e.target.value; render(); } });
      document.addEventListener("keydown", e => { if (e.key === "Escape" && st.open && !document.querySelector(".sheet-bg")) close(); });
    }
    root.hidden = false; st.open = true; document.body.style.overflow = "hidden"; root.scrollTop = 0; render();
  }
  function close() { st.open = false; const r = $("stats-panel"); if (r) r.hidden = true; document.body.style.overflow = ""; }
  window.STATS = { open, onData: () => { if (st.open) render(); } };
})();
