@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo == Baixando os relatorios das operadoras e conferindo com o ERP ==
node coletar.js
echo.
pause
