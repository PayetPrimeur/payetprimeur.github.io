#!/usr/bin/env python3
"""Génère le site public des recettes Payet Primeur à partir de data.json.

Usage : python3 generer.py data.json dossier_sortie
Crée index.html, une page par produit (<slug>/index.html), style.css, recette.js et logo.png.
"""
import html, json, os, re, shutil, sys

ICI = os.path.dirname(os.path.abspath(__file__))
CATS = [("Fruit", "Fruits"), ("Légume", "Légumes"), ("Aromate", "Aromates")]
FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com">'
         '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
         '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nunito:wght@500;700;800;900&family=Kalam:wght@400;700&display=swap">')
UNDERLINE = ('<svg class="underline" viewBox="0 0 150 12" aria-hidden="true"><path d="M3 8 C 30 3, 60 10, 90 5 S 135 4, 147 7" '
             'stroke="#f9b00f" stroke-width="4" fill="none" stroke-linecap="round"/></svg>')
e = lambda s: html.escape(str(s or ""), quote=True)


def head(title, desc, prefix):
    return (f'<!doctype html><html lang="fr"><head><meta charset="utf-8">'
            f'<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
            f'<title>{e(title)}</title><meta name="description" content="{e(desc)}">'
            f'<meta property="og:title" content="{e(title)}"><meta property="og:description" content="{e(desc)}">'
            f'<link rel="icon" href="{prefix}logo.png">{FONTS}<link rel="stylesheet" href="{prefix}style.css"></head><body>')


def footer():
    return ('<footer><span class="hand">Une nouvelle recette chaque dimanche !</span>'
            "<span>Payet Primeur · Saint-Selve &amp; Villenave-d'Ornon</span></footer>")


def page_recette(d, slug, pg):
    r = pg["recette"]
    ings = "".join(
        f'<li class="{"shop" if ref else ""}"><span class="box"></span><span>'
        f'{f"<span class=q>{e(q)}</span>" if q else ""}{e(t)}{"<span class=chez>· chez nous</span>" if ref else ""}</span></li>'
        for q, t, ref in r["ingredients"])
    steps = "".join(f"<li><p>{e(s)}</p></li>" for s in r["etapes"])
    meta = "".join(x for x in [
        f"<li>Préparation <b>{e(r['prep'])}</b></li>" if r.get("prep") else "",
        f"<li>Cuisson <b>{e(r['cuisson'])}</b></li>" if r.get("cuisson") else "",
        f"<li>Pour <b>{e(r['pers'])}</b>{' pers.' if str(r.get('pers', '')).isdigit() else ''}</li>",
        f"<li><b>{e(r['niveau'])}</b></li>"])
    media = ""
    ph = pg.get("photo") or {}
    if ph.get("src"):
        credit = (f'<figcaption>Photo : <a href="{e(ph.get("lien"))}" target="_blank" rel="noopener">{e(ph.get("credit"))}</a> sur Unsplash</figcaption>'
                  if ph.get("credit") else "")
        media = f'<figure class="photo"><img src="{e(ph["src"])}" alt="{e(r["titre"])}" loading="lazy">{credit}</figure>'
    pdf = {"nom": pg["nom"], "semaine": d["semaine"], "photo": ph or None, "recette": r}
    pdf_json = json.dumps(pdf, ensure_ascii=False).replace("<", "\\u003c")
    return (head(f"{pg['nom']} · {r['titre']} | Payet Primeur",
                 f"Recette de la semaine pour {pg['nom']} : {r['titre']}. {r['intro']}", "../")
            + '<div class="wrap">'
            '<header class="top"><a href="../"><img src="../logo.png" alt="Payet Primeur" width="230" height="65"></a>'
            '<p>Extra-frais et de saison, en circuit court</p></header>'
            f'<section class="hero"><h1>{e(pg["nom"])}</h1>{UNDERLINE}<p class="season">{e(pg.get("saison"))}</p></section>'
            '<article class="card"><span class="stamp">Recette de<br>la semaine</span>'
            f'<div><p class="kicker">Semaine {e(d["semaine"])}</p><h2 class="title">{e(r["titre"])}</h2><p class="intro">{e(r["intro"])}</p></div>'
            f'{media}<ul class="meta">{meta}</ul>'
            f'<section><h3>La liste de courses</h3><ul class="ing">{ings}</ul>'
            '<p class="legend">Tout ce qui est marqué « chez nous » se trouve en boutique.</p></section>'
            f'<section><h3>La préparation</h3><ol class="steps">{steps}</ol></section>'
            f'<div class="note"><strong>Le conseil du primeur</strong>{e(r["conseil"])}</div></article>'
            '<div class="pdf"><button type="button" class="btn main" id="pdf-btn" disabled>'
            '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0-5-5m5 5 5-5M5 20h14" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>'
            'Télécharger la recette (PDF)</button><p class="status" id="pdf-msg" role="status"></p></div>'
            '<a class="back" href="../">← Toutes nos recettes de la semaine</a>'
            + footer() + '</div>'
            f'<script type="application/json" id="recette">{pdf_json}</script>'
            '<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>'
            f'<script src="../recette.js"></script></body></html>')


def page_accueil(d):
    groups = []
    for c, label in CATS:
        slugs = sorted({p["page"] for p in d["produits"] if p["c"] == c and p.get("page") and p["actif"] and p["page"] in d["pages"]},
                       key=lambda s: d["pages"][s]["nom"].lower())
        if slugs:
            tiles = "".join(f'<li><a href="{s}/"><b>{e(d["pages"][s]["nom"])}</b><span>{e(d["pages"][s]["recette"]["titre"])}</span></a></li>' for s in slugs)
            groups.append(f'<section class="cat"><h2>{label}</h2><ul class="tiles">{tiles}</ul></section>')
    return (head("Les recettes de la semaine | Payet Primeur",
                 "Une recette de saison pour chaque fruit et légume de la boutique Payet Primeur, renouvelée chaque dimanche.", "")
            + '<div class="wrap"><header class="top"><img src="logo.png" alt="Payet Primeur" width="230" height="65">'
            f'<p>Les recettes de la semaine {e(d["semaine"])}</p></header>' + "".join(groups) + footer() + "</div></body></html>")


def generer(data_path, out):
    d = json.load(open(data_path, encoding="utf-8"))
    os.makedirs(out, exist_ok=True)
    # on repart de zéro pour les pages produits (une page retirée disparaît)
    for name in os.listdir(out):
        p = os.path.join(out, name)
        if os.path.isdir(p) and os.path.exists(os.path.join(p, "index.html")) and not name.startswith((".", "_")):
            shutil.rmtree(p)
    for f in ("style.css", "recette.js", "logo.png"):
        shutil.copy(os.path.join(ICI, f), os.path.join(out, f))
    n = 0
    for slug, pg in d["pages"].items():
        if not re.fullmatch(r"[a-z0-9-]+", slug) or not pg.get("recette"):
            continue
        os.makedirs(os.path.join(out, slug), exist_ok=True)
        open(os.path.join(out, slug, "index.html"), "w", encoding="utf-8").write(page_recette(d, slug, pg))
        n += 1
    open(os.path.join(out, "index.html"), "w", encoding="utf-8").write(page_accueil(d))
    open(os.path.join(out, "404.html"), "w", encoding="utf-8").write(
        head("Page introuvable | Payet Primeur", "Page introuvable", "/") +
        '<div class="wrap"><header class="top"><img src="/logo.png" alt="Payet Primeur" width="230" height="65"></header>'
        '<p>Cette recette n\'est plus en ligne.</p><a class="back" href="/">← Toutes nos recettes de la semaine</a>' + footer() + "</div></body></html>")
    print(f"{n} pages recettes générées dans {out}")


if __name__ == "__main__":
    generer(sys.argv[1], sys.argv[2])
