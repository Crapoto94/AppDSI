@echo off
REM Agent de signature DSI Hub : laissez cette fenetre ouverte (reduite) pendant la signature.
title Agent de signature DSI Hub
cd /d "%~dp0"
node agent.js
echo.
echo L'agent s'est arrete.
pause
