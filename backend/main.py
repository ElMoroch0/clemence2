# backend/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import sqlite3

# 🌐 Création de l’application FastAPI
app = FastAPI()

# ✅ Autorisation CORS (pour laisser le frontend JS communiquer)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # à sécuriser plus tard
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 📦 Modèle de données (quand le frontend envoie une action)
class Action(BaseModel):
    objet: str
    type: str
    valeur: Optional[str] = None  # facultatif, accepte null

# 🧱 Fonction pour connecter à la base SQLite
def get_db():
    conn = sqlite3.connect("interactions.db")
    conn.execute(
        """CREATE TABLE IF NOT EXISTS interactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            objet TEXT,
            type TEXT,
            valeur TEXT,
            date TEXT
        )"""
    )
    return conn

# 📨 Endpoint API pour recevoir les actions du frontend
@app.post("/interaction")
def recevoir_interaction(action: Action):
    try:
        conn = get_db()
        conn.execute(
            "INSERT INTO interactions (objet, type, valeur, date) VALUES (?, ?, ?, ?)",
            (action.objet, action.type, action.valeur, datetime.now().isoformat()),
        )
        conn.commit()
        conn.close()
        print(f"🟢 Action reçue : {action}")
        return {"status": "ok", "message": f"Action {action.type} enregistrée pour {action.objet}"}
    except Exception as e:
        print("❌ Erreur lors de la réception de l'action :", e)
        return {"status": "error", "detail": str(e)}

# ✅ Petit endpoint de test
@app.get("/")
def home():
    return {"message": "API du projet 3D active !"}
