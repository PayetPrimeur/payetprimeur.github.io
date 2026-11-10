/* Statistiques — Payet Primeur Pro
   Lit les sauvegardes de minuit (stocks nécessaires) et les commandes déjà chargées dans `data`. */
(function () {
  const SHOP_COL = { "st-selve": "#5a7827", "villenave": "#2f6fa8" };
  const PERIODES = [["7", "1 sem."], ["28", "4 sem."], ["91", "3 mois"], ["365", "1 an"], ["tout", "Tout"]];
  const BOUT = [["tout", "Les deux"], ["st-selve", "St Selve"], ["villenave", "Villenave"]];
  const JOURS = ["Mardi", "Jeudi", "Vendredi", "Samedi"];
  const st = { open: false, showPrev: false, unit: "kg", pas: "soir", per: "91", shop: "tout", sort: "total", cat: "Tout", prod: null, showAll: false };

  const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
  const n0 = v => nf.format(Math.round(v * 10) / 10);
  const shortDate = k => parseDay(k).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }).replace(/\./g, "");
  const longDate = k => { const t = parseDay(k).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }); return t.charAt(0).toUpperCase() + t.slice(1); };
  const shops = () => st.shop === "tout" ? Object.keys(SITES) : [st.shop];
  const val = (s, site) => { const v = Number(s && s[site]); return isFinite(v) && v > 0 ? v : 0; };
  // équivalences saisies dans le catalogue : 1 dans les stocks = q kg / q pièces…
  const eqOf = (() => { let m = null, src = null; return n => { if (src !== data.products) { src = data.products; m = {}; data.products.forEach(p => { if (p.u && Number(p.u.q) > 0) m[p.n] = p.u; }); } return m[n] || null; }; })();
  // multiplicateur selon l'unité choisie, ou null si le produit n'a pas d'équivalence dans cette unité
  // tout est ramené en kilos : 1 dans les stocks = q kg, ou q pièces (bottes, barquettes) de « kg » chacune
  const kgPer = n => { const u = eqOf(n); if (!u) return null; if (u.t === "kg") return Number(u.q); return Number(u.kg) > 0 ? Number(u.q) * Number(u.kg) : null; };
  const fac = kgPer;
  // unité propre d'un produit (point 3) : sa propre équivalence, ou la quantité brute
  const OWN = { kg: "kg", pc: "pc", botte: "bottes", barq: "barq." };
  const ownF = n => kgPer(n) || 1;
  const own = (n, v) => { const f = kgPer(n); return f ? `${n0(v * f)} kg` : n0(v); };
  const uSuf = () => st.unit === "kg" ? " kg" : st.unit === "pc" ? " pièces" : "";
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
      Object.entries(b.stocks).forEach(([n, s]) => { const f = fac(n); let any = false; sh.forEach(site => { const v = val(s, site); if (f !== null) per[site] += v * f; if (v) any = true; }); if (any) nbProd++; });
      return { k, per, total: sh.reduce((a, site) => a + per[site], 0), nbProd };
    });
    const prods = {}, raw = {};
    const sans = new Set();
    bk.forEach(([k, b]) => Object.entries(b.stocks).forEach(([n, s]) => {
      const v = sh.reduce((a, site) => a + val(s, site), 0);
      const p = raw[n] || (raw[n] = { n, c: catOf(n), total: 0, fois: 0, max: 0, last: 0 });
      p.total += v; if (v) p.fois++; if (v > p.max) p.max = v;
    }));
    if (bk.length) { const lastS = bk[bk.length - 1][1].stocks; Object.values(raw).forEach(p => p.last = sh.reduce((a, site) => a + val(lastS[p.n], site), 0)); }
    bk.forEach(([k, b]) => Object.entries(b.stocks).forEach(([n, s]) => {
      const f = fac(n), raw = sh.reduce((a, site) => a + val(s, site), 0);
      if (f === null) { if (raw) sans.add(n); return; }
      const v = raw * f;
      const p = prods[n] || (prods[n] = { n, c: catOf(n), total: 0, fois: 0, max: 0, last: 0 });
      p.total += v; if (v) p.fois++; if (v > p.max) p.max = v;
    }));
    if (bk.length) { const lastS = bk[bk.length - 1][1].stocks; Object.values(prods).forEach(p => p.last = sh.reduce((a, site) => a + val(lastS[p.n], site), 0) * (fac(p.n) || 0)); }
    const cats = {};
    Object.values(prods).forEach(p => { cats[p.c] = (cats[p.c] || 0) + p.total; });
    const jours = JOURS.map(j => ({ j, tot: 0, n: 0, cats: {} }));
    bk.forEach(([k, b]) => {
      const i = { 2: 0, 4: 1, 5: 2, 6: 3 }[parseDay(k).getDay()]; if (i === undefined) return;
      Object.entries(b.stocks).forEach(([n, s]) => { const f = fac(n); if (f === null) return; const c = catOf(n); jours[i].cats[c] = (jours[i].cats[c] || 0) + sh.reduce((a, site) => a + val(s, site), 0) * f; });
    });
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
    return { bk, sh, sans, series, raw: Object.values(raw), cov: coverage(bk, sh), prods: Object.values(prods), cats, jours, ords, paniers, plateaux, types };
  }

  // part des quantités notées qui ont une équivalence dans l'unité u
  function coverage(bk, sh, u) {
    let tot = 0, ok = 0;
    bk.forEach(([, b]) => Object.entries(b.stocks).forEach(([n, s]) => { const v = sh.reduce((a, site) => a + val(s, site), 0); tot += v; if (kgPer(n) !== null) ok += v; }));
    return tot ? ok / tot : 0;
  }
  const allBk = () => Object.entries(data.sauvegardes || {}).filter(([, b]) => b && b.stocks).sort((a, b) => a[0].localeCompare(b[0]));
  // prochain soir de sauvegarde (aujourd'hui s'il en est un)
  function prochainSoir() { const d = new Date(); for (let i = 0; i < 7; i++) { if ([2, 4, 5, 6].includes(d.getDay())) return d; d.setDate(d.getDate() + 1); } return d; }

  /* point 1 : prévision du prochain soir, d'après les 4 derniers soirs identiques */
  function prevision(sh) {
    const cible = prochainSoir(), jour = cible.getDay(), ck = isoDay(cible);
    const memes = allBk().filter(([k]) => parseDay(k).getDay() === jour && k < ck).slice(-4);
    const nom = cible.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
    let h = `<section class="card"><div class="card-head"><h2>Prévision : ${esc(nom)}</h2><span>soir de sauvegarde</span></div>`;
    if (!memes.length) return h + `<p class="st-note">Il faut au moins une sauvegarde d'un ${esc(cible.toLocaleDateString("fr-FR", { weekday: "long" }))} précédent pour prévoir.</p></section>`;
    const hab = {};
    memes.forEach(([, b]) => Object.entries(b.stocks).forEach(([n, s]) => { hab[n] = (hab[n] || 0) + sh.reduce((a, site) => a + val(s, site), 0); }));
    const noms = new Set(Object.keys(hab).concat(Object.keys(data.stocks || {})));
    const rows = [];
    noms.forEach(n => {
      const hv = (hab[n] || 0) / memes.length, nv = sh.reduce((a, site) => a + val((data.stocks || {})[n], site), 0);
      if (hv < 0.25 && !nv) return;
      let flag = "ok";
      if (hv >= 0.5 && !nv) flag = "vide"; else if (hv < 0.25 && nv) flag = "nouveau";
      else if (nv > hv * 1.3 && nv - hv >= 1) flag = "plus"; else if (nv < hv * 0.7 && hv - nv >= 1) flag = "moins";
      rows.push({ n, hv, nv, flag, poids: hv * (fac(n) || ownF(n)) });
    });
    const ord = { vide: 0, plus: 1, moins: 1, nouveau: 2, ok: 3 };
    rows.sort((a, b) => ord[a.flag] - ord[b.flag] || b.poids - a.poids);
    const alertes = rows.filter(r => r.flag !== "ok").length;
    const shown = st.showPrev ? rows : rows.slice(0, 12);
    const badge = { ok: ["≈", "comme d'habitude"], plus: ["↑", "plus que d'habitude"], moins: ["↓", "moins que d'habitude"], vide: ["!", "rien de noté"], nouveau: ["+", "pas habituel"] };
    h += `<p class="st-note">Quantité habituelle : moyenne des ${memes.length} dernier${memes.length > 1 ? "s" : ""} ${esc(cible.toLocaleDateString("fr-FR", { weekday: "long" }))}s soir, comparée à ce qui est noté maintenant dans les stocks. ${alertes ? `<b>${alertes} écart${alertes > 1 ? "s" : ""} à vérifier</b> en haut de la liste.` : "Aucun écart notable."}</p>
      <div class="st-table-wrap"><table class="st-table st-prev"><thead><tr><th scope="col">Produit</th><th scope="col">Habituel</th><th scope="col">Noté</th><th scope="col"><span class="sr">Écart</span></th></tr></thead><tbody>
      ${shown.map(r => `<tr data-sprod="${esc(r.n)}" class="pv-${r.flag}"><th scope="row">${esc(r.n)}</th><td>${r.hv ? own(r.n, r.hv) : "–"}</td><td><b>${r.nv ? own(r.n, r.nv) : "–"}</b></td><td><span class="pv-b" title="${badge[r.flag][1]}" aria-label="${badge[r.flag][1]}">${badge[r.flag][0]}</span></td></tr>`).join("")}
      </tbody></table></div>
      ${rows.length > 12 ? `<button type="button" class="link" id="st-prevmore">${st.showPrev ? "Afficher moins" : `Afficher les ${rows.length - 12} autres`}</button>` : ""}
      <p class="st-note">≈ comme d'habitude · ↑ plus · ↓ moins · ! rien de noté alors que d'habitude oui · + pas habituel ce soir-là.</p></section>`;
    return h;
  }

  /* point 2 : tendances, 4 dernières semaines contre les 4 précédentes (moyenne par soir) */
  function tendances(sh) {
    const d1 = new Date(); d1.setDate(d1.getDate() - 28); const d2 = new Date(); d2.setDate(d2.getDate() - 56);
    const a1 = isoDay(d1), a2 = isoDay(d2), all = allBk();
    const cur = all.filter(([k]) => k >= a1), prev = all.filter(([k]) => k >= a2 && k < a1);
    let h = `<section class="card"><div class="card-head"><h2>Tendances</h2><span>4 dernières semaines / 4 précédentes</span></div>`;
    if (cur.length < 2 || prev.length < 2) return h + `<p class="st-note">Il faut environ 8 semaines de sauvegardes pour comparer deux périodes de 4 semaines. Les tendances apparaîtront d'elles-mêmes.</p></section>`;
    const moy = list => { const m = {}; list.forEach(([, b]) => Object.entries(b.stocks).forEach(([n, s]) => { m[n] = (m[n] || 0) + sh.reduce((a, site) => a + val(s, site), 0); })); Object.keys(m).forEach(n => m[n] /= list.length); return m; };
    const mc = moy(cur), mp = moy(prev);
    const prods = [...new Set(Object.keys(mc).concat(Object.keys(mp)))].map(n => ({ n, c: mc[n] || 0, p: mp[n] || 0 }));
    const var_ = prods.filter(x => x.p >= 0.5 && (x.c + x.p) >= 1).map(x => Object.assign(x, { r: (x.c - x.p) / x.p }));
    const hausse = var_.filter(x => x.r >= 0.15).sort((a, b) => b.r - a.r).slice(0, 5);
    const baisse = var_.filter(x => x.r <= -0.15).sort((a, b) => a.r - b.r).slice(0, 5);
    const nouv = prods.filter(x => x.p < 0.25 && x.c >= 0.5).sort((a, b) => b.c * ownF(b.n) - a.c * ownF(a.n)).slice(0, 5);
    const pct = r => (r > 0 ? "+" : "−") + Math.round(Math.abs(r) * 100) + " %";
    const line = (x, cls) => `<button type="button" class="st-trow" data-sprod="${esc(x.n)}"><span><b>${esc(x.n)}</b><small>${own(x.n, x.p)} → ${own(x.n, x.c)} par soir</small></span><em class="${cls}">${cls === "nv" ? "nouveau" : pct(x.r)}</em></button>`;
    // catégories dans l'unité choisie
    const catT = {};
    [[mc, "c"], [mp, "p"]].forEach(([m, kk]) => Object.entries(m).forEach(([n, v]) => { const f = fac(n); if (f === null) return; const c = catOf(n); (catT[c] = catT[c] || { c: 0, p: 0 })[kk] += v * f; }));
    const cats = Object.entries(catT).filter(([, x]) => x.p > 0).map(([c, x]) => ({ c, r: (x.c - x.p) / x.p, x })).sort((a, b) => b.r - a.r);
    h += `<div class="st-trend">
      ${cats.length ? `<h3 class="st-h3">Par catégorie${uSuf() ? " (" + uSuf().trim() + ")" : ""}</h3><div class="st-tcats">${cats.map(k => `<span class="st-tcat"><b>${esc(CAT_LABEL[k.c] || k.c)}</b><em class="${k.r >= 0.05 ? "up" : k.r <= -0.05 ? "down" : "eq"}">${Math.abs(k.r) < 0.05 ? "stable" : pct(k.r)}</em></span>`).join("")}</div>` : ""}
      <h3 class="st-h3">En hausse</h3>${hausse.length ? hausse.map(x => line(x, "up")).join("") : `<p class="st-note">Aucune hausse marquée.</p>`}
      <h3 class="st-h3">En baisse</h3>${baisse.length ? baisse.map(x => line(x, "down")).join("") : `<p class="st-note">Aucune baisse marquée.</p>`}
      ${nouv.length ? `<h3 class="st-h3">Nouveaux ces 4 semaines</h3>${nouv.map(x => line(x, "nv")).join("")}` : ""}
      </div><p class="st-note">Comparaison des moyennes par soir de sauvegarde. Touchez un produit pour sa vue précise.</p></section>`;
    return h;
  }

  function couverture(C) {
    const avec = C.prods.filter(p => p.total > 0).length, sans = C.sans.size;
    const u = st.unit === "kg" ? "en kilos" : "en pièces";
    return `${Math.round(C.cov * 100)} % des quantités notées sont couvertes. Calculé sur ${avec} produit${avec > 1 ? "s" : ""} qui ont une équivalence ${u}.` + (sans ? ` ${sans} produit${sans > 1 ? "s" : ""} à prévoir n'en ont pas et ne sont pas comptés : ajoutez leur équivalence dans l'admin, Catalogue.` : "");
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
    // ajustement : ouverture en Kilos quand la plupart des volumes ont une équivalence (tant qu'on n'a pas choisi)
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
        <div class="st-kpi"><small>${st.unit === "kg" ? "Kilos à prévoir" : st.unit === "pc" ? "Pièces à prévoir" : "Quantités à prévoir"}</small><b>${n0(avg(series.map(s => s.total)))}${uSuf() ? `<em>${uSuf()}</em>` : ""}</b><span>en moyenne par soir</span></div>
        <div class="st-kpi"><small>Paniers commandés</small><b>${C.paniers.nb}</b><span>sur la période</span></div>
        <div class="st-kpi"><small>Plateaux commandés</small><b>${C.plateaux.nb}</b><span>sur la période</span></div>
      </div>`;
      if (st.unit !== "stock") h += `<p class="st-cov ${C.cov >= 0.85 ? "good" : C.cov >= 0.6 ? "mid" : "low"}">${Math.round(C.cov * 100)} % des volumes couverts ${st.unit === "kg" ? "en kilos" : "en pièces"}${C.cov < 0.85 ? " · ajoutez des équivalences dans l'admin, Catalogue" : ""}</p>`;
      h += prevision(sh);

      h += `<section class="card"><div class="card-head"><h2>${st.unit === "kg" ? "Kilos à prévoir" : st.unit === "pc" ? "Pièces à prévoir" : "Quantités à prévoir"}</h2>${legend(sh)}</div>${pasCtl()}
        ${vbars("st-evo", parPas(series.map(s => ({ k: s.k, per: s.per })), sh), sh, uSuf().trim())}
        <p class="st-note">${st.unit === "stock" ? "Somme des quantités notées dans l'appli à minuit, telles quelles (pièces, kilos et colis confondus). Choisissez « Kilos » ou « Pièces » en haut pour des volumes réels." : couverture(C)}</p></section>`;
      h += tendances(sh);

      const jr = C.jours.filter(j => j.n);
      h += `<section class="card"><div class="card-head"><h2>Selon le soir</h2><span>${st.unit === "stock" ? "moyenne des quantités à prévoir" : "moyenne par soir, avec les 3 premières catégories"}</span></div>
        ${hbars(jr.map(j => ({ label: j.j + " soir", sub: st.unit === "stock" ? `${j.n} sauvegarde${j.n > 1 ? "s" : ""}` : Object.entries(j.cats).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, v]) => `${CAT_LABEL[c] || c} ${n0(v / j.n)}`).join(" · "), v: j.tot / j.n })), uSuf().trim(), false)}</section>`;

      const cr = Object.entries(C.cats).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
      h += `<section class="card"><div class="card-head"><h2>Par catégorie</h2><span>total sur la période</span></div>
        ${hbars(cr.map(([c, v]) => ({ label: CAT_LABEL[c] || c, v })), uSuf().trim(), false)}</section>`;

      const top = C.prods.filter(p => p.total > 0).sort((a, b) => b.total - a.total).slice(0, 10);
      h += `<section class="card"><div class="card-head"><h2>Les 10 produits les plus à prévoir</h2><span>touchez pour le détail</span></div>
        ${hbars(top.map(p => ({ key: p.n, label: p.n, sub: `à prévoir ${p.fois} soir${p.fois > 1 ? "s" : ""} sur ${bk.length}`, v: p.total })), uSuf().trim(), true)}</section>`;
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
      if (!st.prod || !names.includes(st.prod)) st.prod = (C.raw.filter(p => p.total > 0).sort((a, b) => b.total * ownF(b.n) - a.total * ownF(a.n))[0] || {}).n || names[0];
      const P = C.raw.find(p => p.n === st.prod) || { total: 0, fois: 0, max: 0, last: 0 };
      const E = eqOf(st.prod), ou = kgPer(st.prod) ? "kg" : "";
      const opts = CATS.concat(["Autre"]).map(c => { const ns = names.filter(n => catOf(n) === c); return ns.length ? `<optgroup label="${esc(CAT_LABEL[c] || c)}">${ns.map(n => `<option${n === st.prod ? " selected" : ""}>${esc(n)}</option>`).join("")}</optgroup>` : ""; }).join("");
      h += `<section class="card" id="st-detail"><div class="card-head"><h2>Vue précise d'un produit</h2></div>
        <label class="field">Produit<select id="st-prod">${opts}</select></label>
        <div class="st-kpis small">
          <div class="st-kpi"><small>À prévoir</small><b>${P.fois}<em>/${bk.length}</em></b><span>soirs</span></div>
          <div class="st-kpi"><small>Moyenne</small><b>${n0((P.fois ? P.total / P.fois : 0) * ownF(st.prod))}${ou ? `<em> ${ou}</em>` : ""}</b><span>quand il est à prévoir</span></div>
          <div class="st-kpi"><small>Maximum</small><b>${n0(P.max * ownF(st.prod))}${ou ? `<em> ${ou}</em>` : ""}</b><span>en un soir</span></div>
          <div class="st-kpi"><small>Dernier soir</small><b>${n0(P.last * ownF(st.prod))}${ou ? `<em> ${ou}</em>` : ""}</b><span>${shortDate(bk[bk.length - 1][0])}</span></div>
        </div>
        <p class="st-note">${kgPer(st.prod) ? `1 dans les stocks = ${esc(E.t === "kg" ? n0(E.q) + " kg" : n0(E.q) + " " + (OWN[E.t] || "") + " de " + n0(E.kg) + " kg, soit " + n0(kgPer(st.prod)) + " kg")}.` : E ? "Il manque le poids d'une pièce pour ce produit : quantités telles qu'elles sont notées. Complétez-le dans l'admin, Catalogue." : "Pas d'équivalence pour ce produit : quantités telles qu'elles sont notées. Ajoutez-la dans l'admin, Catalogue."}</p>
        <div class="card-head"><h3 class="st-h3">Historique</h3>${legend(sh)}</div>${pasCtl()}
        ${vbars("st-prodchart", parPas(bk.map(([k, b]) => { const per = {}; sh.forEach(s => per[s] = val(b.stocks[st.prod], s) * ownF(st.prod)); return { k, per }; }), sh), sh, ou)}
      </section>`;

      // tableau complet
      const catsPresent = ["Tout"].concat(CATS.concat(["Autre"]).filter(c => C.raw.some(p => p.c === c)));
      if (!catsPresent.includes(st.cat)) st.cat = "Tout";
      let rows = C.raw.filter(p => st.cat === "Tout" || p.c === st.cat);
      // tri comparable : dans l'unité choisie en haut (produits sans équivalence à la fin), sinon brut
      const cmp = (p, v) => st.unit === "stock" ? v : (fac(p.n) === null ? -1 : v * fac(p.n));
      const key = { total: p => -cmp(p, p.total), fois: p => -p.fois, moy: p => -cmp(p, p.fois ? p.total / p.fois : 0), max: p => -cmp(p, p.max), nom: null }[st.sort];
      rows.sort((a, b) => key ? key(a) - key(b) || a.n.localeCompare(b.n, "fr") : a.n.localeCompare(b.n, "fr"));
      const shown = st.showAll ? rows : rows.slice(0, 25);
      const th = (k, l) => `<th scope="col"><button type="button" data-ssort="${k}" aria-pressed="${st.sort === k}">${l}${st.sort === k ? " ↓" : ""}</button></th>`;
      h += `<section class="card"><div class="card-head"><h2>Tous les produits</h2><span>${rows.length} produit${rows.length > 1 ? "s" : ""}</span></div>
        <div class="chips st-chips">${catsPresent.map(c => `<button type="button" class="chip ${c === "Tout" ? "c-tout" : "c-" + c.replace(/ /g, "-")}" style="${c === "Autre" ? "background:var(--muted)" : ""}" data-scat="${esc(c)}" aria-pressed="${st.cat === c}">${esc(c === "Tout" ? "Tout" : CAT_LABEL[c] || c)}</button>`).join("")}</div>
        <div class="st-table-wrap"><table class="st-table"><thead><tr>${th("nom", "Produit")}${th("fois", "Soirs")}${th("moy", "Moy.")}${th("max", "Max")}${th("total", "Total")}</tr></thead>
        <tbody>${shown.map(p => `<tr data-sprod="${esc(p.n)}"><th scope="row">${esc(p.n)}</th><td>${p.fois}</td><td>${own(p.n, p.fois ? p.total / p.fois : 0)}</td><td>${own(p.n, p.max)}</td><td><b>${own(p.n, p.total)}</b></td></tr>`).join("")}</tbody></table></div>
        ${rows.length > 25 ? `<button type="button" class="link" id="st-more">${st.showAll ? "Afficher moins" : `Afficher les ${rows.length - 25} autres`}</button>` : ""}
        <p class="st-note">Soirs : nombre de sauvegardes où le produit était à prévoir. Moy. : quantité moyenne ces soirs-là. Tout est en kilos, sauf les produits sans équivalence, affichés tels qu'ils sont notés. Touchez une ligne pour sa vue précise.</p></section>`;
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
    if (t.id === "st-prevmore") { st.showPrev = !st.showPrev; return render(); }
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
