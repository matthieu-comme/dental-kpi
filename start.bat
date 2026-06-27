@echo off
title Dental KPI
cd /d "%~dp0backend"
call venv\Scripts\activate.bat

echo Demarrage du serveur Dental KPI...
start "Dental KPI - Serveur" cmd /k "uvicorn app.main:app --host 0.0.0.0 --port 8000"

echo Ouverture dans le navigateur dans 3 secondes...
timeout /t 3 /nobreak > nul
start http://localhost:8000

echo.
echo Le serveur tourne dans la fenetre "Dental KPI - Serveur".
echo Pour arreter l'application, fermez cette fenetre.
timeout /t 5 /nobreak > nul
