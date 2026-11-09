#!/usr/bin/env python3
"""Synchronise _outils/data.json avec le catalogue de l'appli Payet Primeur Pro (Firebase).

Usage : python3 sync.py products.json paniers.json _outils/data.json
- products.json : contenu de /products dans Firebase (liste de {n, c, id, page, actif, titre?})
- paniers.json  : contenu de /paniers dans Firebase ({id: {contenu: [[nom, quantité]], maj}})
Le catalogue de l'appli est la référence : noms, produits en vente, nouveaux produits, paniers.
Les recettes restent dans data.json ; ce script marque seulement ce qui doit être (ré)écrit.
"""
import json, sys

RECETTES = ("Fruit", "Légume", "Aromate")
INGREDIENTS = ("Fruit", "Légume", "Aromate", "Épicerie")
PANIER = "Panier de la semaine"


def charger(path, defaut):
    try:
        v = json.load(open(path, encoding="utf-8"))
        return defaut if v is None else v
    except (OSError, ValueError):
        return defaut


def main(prod_path, pan_path, data_path):
    fb = charger(prod_path, [])
    if isinstance(fb, dict):  # Firebase renvoie parfois un objet indexé
        fb = [fb[k] for k in sorted(fb, key=lambda k: int(k) if str(k).isdigit() else 0)]
    fb = [p for p in fb if isinstance(p, dict) and p.get("n") and p.get("c")]
    if not fb or not any(p.get("id") for p in fb):
        print("Catalogue pas encore relié (aucun identifiant) : rien à faire.")
        return
    pan = charger(pan_path, {}) or {}
    d = json.load(open(data_path, encoding="utf-8"))

    anciens = {p.get("id"): p["n"] for p in d.get("produits", []) if p.get("id")}
    produits = [{"n": p["n"], "c": p["c"], "id": p["id"], "page": p.get("page"), "actif": p.get("actif", True) is not False}
                for p in fb if p["c"] in INGREDIENTS and p.get("id")]
    noms = {p["n"] for p in produits}

    # produits renommés dans l'appli : les recettes suivent le nouveau nom
    renommes = {anciens[p["id"]]: p["n"] for p in produits if p["id"] in anciens and anciens[p["id"]] != p["n"]}
    def renommer(recette):
        for ing in recette.get("ingredients", []):
            if len(ing) > 2 and ing[2] in renommes:
                ing[2] = renommes[ing[2]]
    for pg in d["pages"].values():
        if pg.get("recette"):
            renommer(pg["recette"])
    for b in d.get("paniers", []):
        for r in b.get("recettes", []):
            renommer(r)
        b["recettesPour"] = [[renommes.get(x[0], x[0]), x[1]] for x in b.get("recettesPour", [])]

    actifs = {p["n"] for p in produits if p["actif"]}
    fruits = {p["n"] for p in produits if p["c"] == "Fruit"}
    titres = {p["page"]: p.get("titre") for p in fb if p.get("page") and p.get("titre")}

    # pages : nouvelles, titres, recettes à refaire
    pages_actives = {}
    for p in produits:
        if p["page"] and p["c"] in RECETTES:
            pages_actives.setdefault(p["page"], []).append(p)
    for slug, ps in pages_actives.items():
        pg = d["pages"].get(slug)
        if pg is None:
            pg = d["pages"][slug] = {"nom": ps[0]["n"], "saison": "", "photo": None, "historique": [], "aRevoir": True}
            if ps[0]["c"] == "Fruit":
                pg["type"] = "fruit"
        if titres.get(slug):
            pg["nom"] = titres[slug]
        if not any(p["actif"] for p in ps):
            continue
        if pg.get("type") == "fruit":
            if not pg.get("maturite"):
                pg["aRevoir"] = True
        elif not pg.get("recette") or any(ing[2] and (ing[2] not in actifs or ing[2] in fruits)
                                          for ing in pg["recette"]["ingredients"] if len(ing) > 2):
            pg["aRevoir"] = True

    # paniers : contenu venu de l'appli, recettes gardées tant que le contenu n'a pas changé
    avant = {b["id"]: b for b in d.get("paniers", [])}
    paniers = []
    for p in fb:
        if p["c"] != PANIER or not p.get("id") or p.get("actif") is False:
            continue
        info = pan.get(p["id"]) or {}
        contenu = [[x[0], x[1] if len(x) > 1 else ""] for x in (info.get("contenu") or []) if x and x[0]]
        b = avant.get(p["id"], {})
        nb = {"id": p["id"], "nom": p["n"], "contenu": contenu,
              "recettes": b.get("recettes", []), "recettesPour": b.get("recettesPour", []), "semaine": b.get("semaine", "")}
        if contenu and (contenu != nb["recettesPour"] or len(nb["recettes"]) != 2):
            nb["aFaire"] = True
        paniers.append(nb)

    d["produits"] = produits
    d["paniers"] = paniers
    json.dump(d, open(data_path, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    print(f"{len(produits)} produits, {len(paniers)} paniers ; renommés : {renommes or 'aucun'} ; "
          f"en attente : {[s for s, pg in d['pages'].items() if pg.get('aRevoir') and s in pages_actives]}")


if __name__ == "__main__":
    main(*sys.argv[1:4])
