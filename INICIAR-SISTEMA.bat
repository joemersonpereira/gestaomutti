@echo off
chcp 65001 >nul
cd /d "%~dp0backend"
title Sistema Mutti - servidor (nao feche esta janela)

echo ============================================================
echo   Sistema Mutti — servidor
echo ============================================================
echo.

for /f "tokens=2 delims=:" %%i in ('ipconfig ^| findstr /c:"IPv4"') do (
  for /f "tokens=1" %%j in ("%%i") do set IP=%%j
)

echo   Acesse de qualquer computador do escritorio:
echo       http://%IP%:3001
echo.
echo   Nesta maquina:
echo       http://localhost:3001
echo.
echo   Deixe esta janela aberta. Para desligar, feche ou Ctrl+C.
echo ============================================================
echo.

rem libera a porta no firewall do Windows (so faz efeito com admin; ignora se ja existe)
netsh advfirewall firewall add rule name="Sistema Mutti 3001" dir=in action=allow protocol=TCP localport=3001 >nul 2>&1

node src\server.js

echo.
echo   O servidor parou. Leia a mensagem acima para saber por que.
pause
