@echo off
REM Deploie UNIQUEMENT le magasin d'applications (magapp-frontend) sur le serveur Docker distant :
REM git pull, puis rebuild sans cache + redemarrage du seul service magapp-frontend
REM (le backend et les autres conteneurs ne sont ni reconstruits ni redemarres).
REM Reutilise la connexion SSH (ip, login, mot de passe, chemin) de pulldocker.ini
REM en remplacant uniquement les commandes cmdX par celles du magapp.
TITLE Deploiement Docker distant - MagApp
setlocal

set "BASE_INI=%~dp0pulldocker.ini"
set "TMP_INI=%TEMP%\pulldockermagapp_%RANDOM%.ini"

if not exist "%BASE_INI%" (
    echo Fichier de configuration introuvable : %BASE_INI%
    echo.
    pause
    exit /b 1
)

REM Copie de l'ini sans les lignes cmdX, puis ajout des commandes MagApp
findstr /v /b /i "cmd" "%BASE_INI%" > "%TMP_INI%"
echo cmd1:git pull>> "%TMP_INI%"
echo cmd2:docker compose build --no-cache magapp-frontend ^&^& docker compose up -d --no-deps magapp-frontend>> "%TMP_INI%"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0pulldocker.ps1" -IniPath "%TMP_INI%"
set "RC=%ERRORLEVEL%"

REM Le fichier temporaire contient le mot de passe : on le supprime toujours
del "%TMP_INI%" >nul 2>&1

echo.
pause
exit /b %RC%
