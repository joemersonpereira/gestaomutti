@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo == Iniciando o servidor (deixe esta janela aberta) ==
node src/server.js
pause
