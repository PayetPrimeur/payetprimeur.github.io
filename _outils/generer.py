#!/usr/bin/env python3
"""Génère le site public des recettes Payet Primeur à partir de data.json.

Usage : python3 generer.py data.json dossier_sortie
Crée index.html, une page par produit (<slug>/index.html), style.css, recette.js et logo.png.
"""
import html, json, os, re, shutil, sys

ICI = os.path.dirname(os.path.abspath(__file__))
CATS = [("Fruit", "Fruits"), ("Légume", "Légumes"), ("Aromate", "Aromates")]
# dossiers du dépôt qui ne sont pas des pages recettes : jamais effacés par le générateur
DOSSIERS_PROTEGES = {"appli"}
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


def entete(pg, prefix="../"):
    return ('<div class="wrap">'
            f'<header class="top"><a href="{prefix}"><img src="{prefix}logo.png" alt="Payet Primeur" width="230" height="65"></a>'
            '<p>Extra-frais et de saison, en circuit court</p></header>'
            f'<section class="hero"><h1>{e(pg["nom"])}</h1>{UNDERLINE}<p class="season">{e(pg.get("saison"))}</p></section>')


def page_fruit(d, slug, pg):
    if pg.get("maturite"):
        corps = ('<article class="card"><span class="stamp">Le conseil<br>du primeur</span>'
                 f'<section><h3>Comment savoir s\'il est mûr</h3><p class="advice">{e(pg["maturite"])}</p></section>'
                 f'<div class="note"><strong>Comment le conserver</strong>{e(pg.get("conservation"))}</div></article>')
    else:
        corps = '<div class="card"><p class="intro">Nos conseils pour ce fruit arrivent très bientôt.</p></div>'
    return (head(f"{pg['nom']} : bien le choisir et le conserver | Payet Primeur",
                 f"Comment savoir si {pg['nom'].lower()} est mûr et comment le conserver : les conseils de votre primeur.", "../")
            + entete(pg) + corps + '<a class="back" href="../">← Toutes nos recettes et conseils</a>' + footer() + '</div></body></html>')


def page_attente(d, slug, pg):
    return (head(f"{pg['nom']} | Payet Primeur", f"La recette de la semaine pour {pg['nom']}.", "../")
            + entete(pg) + '<div class="card"><p class="intro">La recette de la semaine arrive très bientôt. Revenez dans quelques minutes !</p></div>'
            '<a class="back" href="../">← Toutes nos recettes et conseils</a>' + footer() + '</div></body></html>')


def page_recette(d, slug, pg):
    if pg.get("type") == "fruit":
        return page_fruit(d, slug, pg)
    if not pg.get("recette"):
        return page_attente(d, slug, pg)
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
            f'<div><p class="kicker">Semaine {e(d["semaine"])}</p>'
            + (f'<p class="origin">Recette traditionnelle · {e(r["origine"])}</p>' if r.get("origine") else "")
            + f'<h2 class="title">{e(r["titre"])}</h2><p class="intro">{e(r["intro"])}</p></div>'
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


def recette_card(r, stamp, kicker, media=""):
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
    return (f'<article class="card"><span class="stamp">{stamp}</span>'
            f'<div><p class="kicker">{e(kicker)}</p>'
            + (f'<p class="origin">Recette traditionnelle · {e(r["origine"])}</p>' if r.get("origine") else "")
            + f'<h2 class="title">{e(r["titre"])}</h2><p class="intro">{e(r["intro"])}</p></div>'
            f'{media}<ul class="meta">{meta}</ul>'
            f'<section><h3>La liste de courses</h3><ul class="ing">{ings}</ul>'
            '<p class="legend">Tout ce qui est marqué « chez nous » se trouve en boutique.</p></section>'
            f'<section><h3>La préparation</h3><ol class="steps">{steps}</ol></section>'
            f'<div class="note"><strong>Le conseil du primeur</strong>{e(r["conseil"])}</div></article>')


PDF_BTN = ('<div class="pdf"><button type="button" class="btn main" id="pdf-btn" disabled>'
           '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0-5-5m5 5 5-5M5 20h14" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>'
           'Télécharger la recette (PDF)</button><p class="status" id="pdf-msg" role="status"></p></div>')


def conseils_panier(d, b):
    """Conseils du primeur pour chaque produit du panier : fiche des fruits, conseil de la recette des légumes et aromates."""
    prods = {p["n"]: p for p in d.get("produits", [])}
    vus, out = set(), []
    for n, _q in b.get("contenu", []):
        p = prods.get(n)
        slug = p.get("page") if p else None
        pg = d.get("pages", {}).get(slug) if slug else None
        if not pg or slug in vus:
            continue
        if pg.get("type") == "fruit":
            if pg.get("maturite") or pg.get("conservation"):
                vus.add(slug)
                out.append({"nom": n, "fruit": True, "maturite": pg.get("maturite", ""), "conservation": pg.get("conservation", "")})
        elif (pg.get("recette") or {}).get("conseil"):
            vus.add(slug)
            out.append({"nom": n, "fruit": False, "conseil": pg["recette"]["conseil"]})
    return out


def page_panier(d, b):
    recs = [] if b.get("aFaire") else (b.get("recettes") or [])
    items = "".join(f'<li class="shop"><span class="box"></span><span>{f"<span class=q>{e(q)}</span>" if q else ""}{e(n)}</span></li>'
                    for n, q in b.get("contenu", []))
    stamps = ["Vite fait !", "On prend<br>son temps"]
    kickers = ["Idée n° 1 · la recette rapide", "Idée n° 2 · la recette plus lente"]
    corps = ("".join(recette_card(r, stamps[i] if i < 2 else "Recette", kickers[i] if i < 2 else b["nom"]) for i, r in enumerate(recs))
             if recs else '<div class="card"><p class="intro">Les recettes de ce panier arrivent très bientôt. Revenez dans quelques heures !</p></div>')
    tips = conseils_panier(d, b)
    tips_html = ""
    if tips:
        notes = "".join(
            f'<div class="note"><strong>Le conseil du primeur · {e(t["nom"])}</strong>'
            + ((f'<span class="tip-l"><b>Bien mûr ?</b> {e(t["maturite"])}</span>' if t.get("maturite") else "")
               + (f'<span class="tip-l"><b>Conservation :</b> {e(t["conservation"])}</span>' if t.get("conservation") else "")
               if t["fruit"] else e(t["conseil"]))
            + '</div>' for t in tips)
        tips_html = ('<article class="card tips"><span class="stamp">Le conseil<br>du primeur</span>'
                     '<div><p class="kicker">Pour bien profiter de votre panier</p><h2 class="title">Les conseils du primeur</h2></div>'
                     f'{notes}</article>')
    pdf = {"titre": "Merci pour votre achat !", "sousTitre": b["nom"], "fichier": b["nom"], "semaine": d["semaine"],
           "contenu": b.get("contenu", []), "recettes": recs, "conseils": tips}
    pdf_json = json.dumps(pdf, ensure_ascii=False).replace("<", "\\u003c")
    sous = f"Deux idées au choix pour cuisiner votre {b['nom'].lower()}" if recs else b["nom"]
    return (head(f"Merci pour votre achat ! · {b['nom']} | Payet Primeur", f"Deux idées de recettes au choix pour cuisiner votre {b['nom'].lower()}.", "../")
            + '<div class="wrap"><header class="top"><a href="../"><img src="../logo.png" alt="Payet Primeur" width="230" height="65"></a>'
            '<p>Extra-frais et de saison, en circuit court</p></header>'
            f'<section class="hero thanks"><h1>Merci pour votre achat !</h1>{UNDERLINE}<p class="season">{e(sous)}</p></section>'
            + (f'<section class="card basket-list"><h3>Dans votre panier</h3><ul class="ing">{items}</ul></section>' if items else "")
            + corps + tips_html + (PDF_BTN if recs else "")
            + '<a class="back" href="../">← Toutes nos recettes de la semaine</a>' + footer() + '</div>'
            + f'<script type="application/json" id="recette">{pdf_json}</script>'
            + ('<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script><script src="../recette.js"></script>' if recs else "")
            + '</body></html>')


def tuile(pg):
    if pg.get("type") == "fruit":
        return "Bien le choisir et le conserver"
    return pg["recette"]["titre"] if pg.get("recette") else "Recette en préparation"


def page_accueil(d):
    groups = []
    for c, label in CATS:
        slugs = sorted({p["page"] for p in d["produits"] if p["c"] == c and p.get("page") and p["actif"] and p["page"] in d["pages"]},
                       key=lambda s: d["pages"][s]["nom"].lower())
        if slugs:
            tiles = "".join(f'<li><a href="{s}/"><b>{e(d["pages"][s]["nom"])}</b><span>{e(tuile(d["pages"][s]))}</span></a></li>' for s in slugs)
            groups.append(f'<section class="cat"><h2>{label}</h2><ul class="tiles">{tiles}</ul></section>')
    return (head("Les recettes de la semaine | Payet Primeur",
                 "Une recette de saison pour chaque fruit et légume de la boutique Payet Primeur, renouvelée chaque dimanche.", "")
            + '<div class="wrap"><header class="top"><img src="logo.png" alt="Payet Primeur" width="230" height="65">'
            f'<p>Nos recettes et conseils de la semaine {e(d["semaine"])}</p></header>' + "".join(groups) + footer() + "</div></body></html>")


def generer(data_path, out):
    d = json.load(open(data_path, encoding="utf-8"))
    os.makedirs(out, exist_ok=True)
    # on repart de zéro pour les pages produits (une page retirée disparaît)
    for name in os.listdir(out):
        p = os.path.join(out, name)
        if os.path.isdir(p) and os.path.exists(os.path.join(p, "index.html")) and not name.startswith((".", "_")) and name not in DOSSIERS_PROTEGES:
            shutil.rmtree(p)
    for f in ("style.css", "recette.js", "logo.png"):
        shutil.copy(os.path.join(ICI, f), os.path.join(out, f))
    n = 0
    for slug, pg in d["pages"].items():
        if not re.fullmatch(r"[a-z0-9-]+", slug):
            continue
        os.makedirs(os.path.join(out, slug), exist_ok=True)
        open(os.path.join(out, slug, "index.html"), "w", encoding="utf-8").write(page_recette(d, slug, pg))
        n += 1
    for b in d.get("paniers", []):
        if re.fullmatch(r"panier[a-z0-9-]*", b.get("id", "")):
            os.makedirs(os.path.join(out, b["id"]), exist_ok=True)
            open(os.path.join(out, b["id"], "index.html"), "w", encoding="utf-8").write(page_panier(d, b))
            n += 1
    open(os.path.join(out, "index.html"), "w", encoding="utf-8").write(page_accueil(d))
    open(os.path.join(out, "404.html"), "w", encoding="utf-8").write(
        head("Page introuvable | Payet Primeur", "Page introuvable", "/") +
        '<div class="wrap"><header class="top"><img src="/logo.png" alt="Payet Primeur" width="230" height="65"></header>'
        '<p>Cette recette n\'est plus en ligne.</p><a class="back" href="/">← Toutes nos recettes de la semaine</a>' + footer() + "</div></body></html>")
    ecrire_etat(d, out)
    print(f"{n} pages recettes générées dans {out}")


def ecrire_etat(d, out):
    """etat.json : lu par l'appli pour afficher « recette prête » / « en préparation »."""
    import datetime
    pages = {}
    for slug, pg in d["pages"].items():
        x = {"nom": pg.get("nom", "")}
        if pg.get("type") == "fruit":
            x["type"] = "fruit"
            if not pg.get("maturite"):
                x["attente"] = True
        elif pg.get("recette") and not pg.get("aRevoir"):
            x["titre"] = pg["recette"]["titre"]
        else:
            x["attente"] = True
        pages[slug] = x
    paniers = {b["id"]: {"contenu": b.get("recettesPour", []), "pret": bool(b.get("recettes")) and not b.get("aFaire")}
               for b in d.get("paniers", [])}
    etat = {"pages": pages, "paniers": paniers}
    chemin = os.path.join(out, "etat.json")
    try:
        ancien = json.load(open(chemin, encoding="utf-8"))
        maj = ancien.pop("maj", None)
        if ancien == etat and maj:
            etat["maj"] = maj
    except (OSError, ValueError):
        pass
    etat.setdefault("maj", datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))
    json.dump(etat, open(chemin, "w", encoding="utf-8"), ensure_ascii=False)


if __name__ == "__main__":
    generer(sys.argv[1], sys.argv[2])
