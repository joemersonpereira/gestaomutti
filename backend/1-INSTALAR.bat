@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo == Instalando dependencias (pode demorar 1-2 min) ==
call npm install
echo.
echo == Pronto! Se nao apareceu erro vermelho, deu certo. ==
pause
