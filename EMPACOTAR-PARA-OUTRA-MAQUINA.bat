@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================================
echo   Empacotar o sistema para levar para outra maquina
echo ============================================================
echo.
echo   Gera um .zip na sua Area de Trabalho, SEM:
echo     - node_modules  ^(a outra maquina baixa sozinha^)
echo     - .env          ^(tem senha: voce preenche la^)
echo     - sessoes/      ^(sao os logins dos portais: gravar la^)
echo     - o banco       ^(criado na instalacao^)
echo.
pause

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0empacotar.ps1"

echo.
pause
