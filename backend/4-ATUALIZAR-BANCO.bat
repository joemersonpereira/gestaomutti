@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo == Aplicando atualizacoes no banco existente (NAO apaga dados) ==
node src/db/migrar-pendentes.js
echo.
pause
