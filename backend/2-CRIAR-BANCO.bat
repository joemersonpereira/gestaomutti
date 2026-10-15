@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo == Criando o banco de dados (com dados de demonstracao) ==
echo ATENCAO: isso recria o banco do zero. So use numa instalacao nova.
node src/db/setup.js
echo.
pause
