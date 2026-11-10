"""Affiche un jeton d'accès Firebase (valable 1 h) à partir du compte de service
rangé dans le secret GitHub FIREBASE_SERVICE_ACCOUNT (contenu JSON complet).
Tolère un copier-coller imparfait (espaces, caractère invisible, guillemets typographiques)."""
import json, os, sys
from google.oauth2 import service_account
from google.auth.transport.requests import Request

brut = os.environ.get("SA", "")
t = brut.replace("﻿", "").replace("​", "").replace(" ", " ")
t = t.replace("“", '"').replace("”", '"').replace("«", '"').replace("»", '"')
debut, fin = t.find("{"), t.rfind("}")
try:
    if debut < 0 or fin < debut:
        raise ValueError("aucune accolade")
    info = json.loads(t[debut:fin + 1])
    if info.get("type") != "service_account" or "private_key" not in info:
        raise ValueError("ce n'est pas une clé de compte de service")
except Exception as e:
    # diagnostic sans rien révéler du contenu
    print(f"Secret illisible ({e}). Longueur {len(brut)} caractères, "
          f"accolade ouvrante : {'oui' if debut >= 0 else 'non'}, "
          f"contient service_account : {'oui' if 'service_account' in t else 'non'}, "
          f"contient private_key : {'oui' if 'private_key' in t else 'non'}, "
          f"premier caractère : U+{ord(brut[0]):04X}" if brut else "Secret vide.", file=sys.stderr)
    sys.exit(2)
cred = service_account.Credentials.from_service_account_info(info, scopes=[
    "https://www.googleapis.com/auth/firebase.database",
    "https://www.googleapis.com/auth/userinfo.email"])
cred.refresh(Request())
sys.stdout.write(cred.token)
