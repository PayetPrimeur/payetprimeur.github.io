"""Affiche un jeton d'accès Firebase (valable 1 h) à partir du compte de service
rangé dans le secret GitHub FIREBASE_SERVICE_ACCOUNT (contenu JSON complet)."""
import json, os, sys
from google.oauth2 import service_account
from google.auth.transport.requests import Request

info = json.loads(os.environ["SA"])
cred = service_account.Credentials.from_service_account_info(info, scopes=[
    "https://www.googleapis.com/auth/firebase.database",
    "https://www.googleapis.com/auth/userinfo.email"])
cred.refresh(Request())
sys.stdout.write(cred.token)
