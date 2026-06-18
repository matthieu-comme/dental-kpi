@echo off
title Mise a jour - Dental KPI
cd /d "%~dp0"

echo ================================
echo   Mise a jour de Dental KPI
echo ================================
echo.

echo [1/4] Recuperation des modifications...
git pull
if %errorlevel% neq 0 (
    echo.
    echo ERREUR : La mise a jour a echoue.
    echo Verifiez votre connexion internet et contactez le developpeur.
    pause
    exit /b 1
)

echo.
echo [2/4] Mise a jour des dependances serveur...
cd backend
call venv\Scripts\activate.bat
pip install -r requirements.txt -q
pip install aiofiles -q

echo.
echo [3/4] Mise a jour des dependances interface...
cd ..\frontend
call npm install --silent

echo.
echo [4/4] Compilation de l'interface...
call npm run build

echo.
echo ================================
echo   Mise a jour terminee !
echo   Vous pouvez relancer start.bat
echo ================================
pause
