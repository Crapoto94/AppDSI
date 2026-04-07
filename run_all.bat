@echo off
TITLE AppDSI Launcher
echo ==========================================
echo       Lancement de l'ecosysteme AppDSI
echo ==========================================

echo.
echo [1/3] Lancement du BACKEND...
start "AppDSI - Backend" cmd /k "cd backend && npm start"

echo [2/3] Lancement du FRONTEND PRINCIPAL...
start "AppDSI - Frontend" cmd /k "cd frontend && npm run dev"

echo [3/3] Lancement du FRONTEND MAGAPP...
start "AppDSI - MagApp Frontend" cmd /k "cd magapp-frontend && npm run dev"

echo.
echo ==========================================
echo  Tous les services ont ete lances !
echo ==========================================
pause
