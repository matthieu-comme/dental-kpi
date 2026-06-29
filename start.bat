@echo off
title Dental KPI
cd /d "%~dp0backend"

echo Demarrage du serveur Dental KPI...

rem py.exe est le Python Launcher installe dans C:\Windows\ par Python/winget.
rem Il est signe Microsoft et autorise par Device Guard.
rem PYTHONPATH pointe vers les packages du venv (fastapi, uvicorn, etc.)
set "PYTHONPATH=%~dp0backend\venv\Lib\site-packages"
start "Dental KPI - Serveur" cmd /k "py -3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000"

echo Ouverture dans le navigateur dans 3 secondes...
timeout /t 3 /nobreak > nul
start http://localhost:8000

echo.
echo Le serveur tourne dans la fenetre "Dental KPI - Serveur".
echo Pour arreter l'application, fermez cette fenetre.
timeout /t 5 /nobreak > nul
