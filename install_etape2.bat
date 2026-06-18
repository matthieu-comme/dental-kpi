@echo off
title Installation Dental KPI - Etape 2/2
cd /d "%~dp0"

echo =============================================
echo   Installation de Dental KPI - Etape 2/2
echo   Configuration du projet
echo =============================================
echo.

echo [1/5] Verification de Python...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo ERREUR : Python est introuvable.
    echo Verifiez que l'etape 1 s'est bien terminee
    echo et que vous avez ferme puis rouvre cette fenetre.
    pause
    exit /b 1
)
python --version

echo.
echo [2/5] Verification de Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo ERREUR : Node.js est introuvable.
    echo Verifiez que l'etape 1 s'est bien terminee
    echo et que vous avez ferme puis rouvre cette fenetre.
    pause
    exit /b 1
)
node --version

echo.
echo [3/5] Creation de l'environnement Python...
cd backend
python -m venv venv
if %errorlevel% neq 0 (
    echo ERREUR : Impossible de creer l'environnement Python.
    pause
    exit /b 1
)

echo.
echo [4/5] Installation des dependances serveur...
call venv\Scripts\activate.bat
pip install -r requirements.txt -q
pip install aiofiles -q

echo.
echo [5/5] Installation et compilation de l'interface...
cd ..\frontend
call npm install --silent
call npm run build

echo.
echo =============================================
echo   Installation terminee !
echo.
echo   Pour lancer l'application :
echo   double-cliquez sur start.bat
echo =============================================
pause
