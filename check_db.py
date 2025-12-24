import sqlite3

# Connexion à la base
conn = sqlite3.connect("interactions.db")
cursor = conn.cursor()

# Récupérer toutes les lignes de la table interactions
cursor.execute("SELECT * FROM interactions")
rows = cursor.fetchall()

# Afficher chaque interaction
for row in rows:
    print(row)

# Fermer la connexion
conn.close()
