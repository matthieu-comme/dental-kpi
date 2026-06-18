@echo off
title Installation Dental KPI - Etape 1/2
cd /d "%~dp0"

echo =============================================
echo   Installation de Dental KPI - Etape 1/2
echo   Installation des outils systeme
echo =============================================
echo.
echo Cette etape installe Python, Node.js et Git,
echo puis telecharge le projet automatiquement.
echo Une connexion internet est necessaire.
echo Duree estimee : 5 a 10 minutes.
echo.
pause

echo.
echo Verification de winget...
winget --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo ERREUR : winget n'est pas disponible sur ce PC.
    echo Ouvrez le Microsoft Store, cherchez "App Installer"
    echo et installez-le, puis relancez ce script.
    pause
    exit /b 1
)

echo.
echo [1/4] Installation de Python...
winget install Python.Python.3.13 --accept-package-agreements --accept-source-agreements

echo.
echo [2/4] Installation de Node.js...
winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements

echo.
echo [3/4] Installation de Git...
winget install Git.Git --accept-package-agreements --accept-source-agreements

echo.
echo [4/4] Telechargement du projet...
echo.
echo Ou voulez-vous installer le projet ?
echo (Appuyez sur Entree pour utiliser le Bureau)
set /p INSTALL_DIR="Chemin d'installation [%USERPROFILE%\Bureau] : "
if "%INSTALL_DIR%"=="" set INSTALL_DIR=%USERPROFILE%\Bureau

echo.
echo Telechargement dans %INSTALL_DIR%\dental-kpi ...

cd /d "%INSTALL_DIR%"
"%ProgramFiles%\Git\bin\git.exe" clone https://github.com/matthieu-comme/dental-kpi.git
if %errorlevel% neq 0 (
    echo.
    echo ERREUR : Le telechargement a echoue.
    echo Verifiez votre connexion internet et reessayez.
    pause
    exit /b 1
)

echo.
echo =============================================
echo   Etape 1/2 terminee !
echo.
echo   IMPORTANT :
echo   1. Fermez cette fenetre
echo   2. Ouvrez le dossier dental-kpi
echo      sur votre Bureau
echo   3. Double-cliquez sur install_etape2.bat
echo =============================================
pause
