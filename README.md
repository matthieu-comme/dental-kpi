# Manuel d'Installation du Projet

## 1. Prérequis

- **Node.js** : v22
- **Python** : 3.10 ou supérieur
- **Git**

## 2. Récupération du projet

```bash
git clone https://github.com/matthieu-comme/dental-kpi.git
cd dental-kpi
```

## 3. Configuration du Back-end (FastAPI)

```bash
cd backend

# Création et activation de l'environnement virtuel
python -m venv venv

# Activation (Windows) :
venv\Scripts\activate
# Activation (macOS/Linux) :
source venv/bin/activate

# Installation des dépendances
pip install -r requirements.txt

# Lancement du serveur local
uvicorn main:app --reload
```

## 4. Configuration du Front-end (React)

Ouvrez un nouveau terminal, placez-vous à la racine du projet :

```bash
cd frontend

# Installation des dépendances
npm install

# Lancement du serveur de développement
npm run dev
```

## 5. Accès

- **Application (Front-end)** : `http://localhost:5173`
- **API (Back-end)** : `http://127.0.0.1:8000`
