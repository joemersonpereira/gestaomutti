@echo off
chcp 65001 >nul
cd /d "%~dp0"
setlocal

echo ============================================================
echo   Agendar a coleta diaria dos relatorios de cartao
echo ============================================================
echo.

rem ---- confere o basico antes de agendar --------------------------------
where node >nul 2>&1
if errorlevel 1 (
  echo   [X] Node.js nao esta instalado nesta maquina.
  echo       Baixe em https://nodejs.org ^(versao 20 ou maior^) e rode este arquivo de novo.
  goto :fim
)
echo   [ok] Node.js encontrado

if not exist "node_modules\" (
  echo   [X] Faltam as dependencias. Rode antes, nesta pasta:
  echo         npm install
  echo         npx playwright install chromium
  goto :fim
)
echo   [ok] Dependencias instaladas

if not exist ".env" (
  echo   [X] Falta o arquivo .env
  echo       Copie o .env.exemplo para .env e preencha COLETOR_EMAIL,
  echo       COLETOR_SENHA e COLETOR_API.
  goto :fim
)
echo   [ok] .env encontrado

dir /b sessoes\*.json >nul 2>&1
if errorlevel 1 (
  echo.
  echo   [!] Nenhuma sessao gravada ainda.
  echo       Se agendar agora, o robo vai falhar todo dia as 10:00 no login.
  echo       Rode antes o GRAVAR-SESSAO.bat para pelo menos um portal.
  echo.
  set /p SEGUIR=Agendar mesmo assim? (S/N):
  if /i not "%SEGUIR%"=="S" goto :fim
) else (
  echo   [ok] Sessao^(oes^) gravada^(s^)
)

rem ---- monta o XML com o caminho desta maquina ---------------------------
echo.
echo   Registrando a tarefa para rodar todo dia as 10:00...

set "ALVO=%~dp0COLETAR-AGENDADO.bat"
set "PASTA=%~dp0"
if "%PASTA:~-1%"=="\" set "PASTA=%PASTA:~0,-1%"

powershell -NoProfile -Command ^
  "$x = Get-Content -Raw -Encoding UTF8 'tarefa-agendada.xml';" ^
  "$x = $x.Replace('CAMINHO_DO_BAT', '%ALVO%').Replace('CAMINHO_DA_PASTA', '%PASTA%');" ^
  "Set-Content -Path \"$env:TEMP\mutti-coleta.xml\" -Value $x -Encoding Unicode"

schtasks /create /tn "Mutti - Coleta de cartoes" /xml "%TEMP%\mutti-coleta.xml" /f
if errorlevel 1 (
  echo.
  echo   Nao consegui registrar. Tente com o botao direito ^>
  echo   "Executar como administrador".
  goto :fim
)
del "%TEMP%\mutti-coleta.xml" >nul 2>&1

echo.
echo   ---------------------------------------------------------
echo   Pronto. A coleta roda todo dia as 10:00.
echo.
echo   Se o micro estiver desligado no horario, roda assim que ligar.
echo   Funciona na bateria. Se travar, o Windows encerra em 1 hora.
echo.
echo   Rodar agora, sem esperar:
echo     schtasks /run /tn "Mutti - Coleta de cartoes"
echo.
echo   Ver quando rodou pela ultima vez:
echo     schtasks /query /tn "Mutti - Coleta de cartoes" /v /fo LIST
echo.
echo   Desligar o agendamento:
echo     schtasks /delete /tn "Mutti - Coleta de cartoes" /f
echo.
echo   O que aconteceu em cada rodada:  logs\agendado.log
echo   ---------------------------------------------------------

:fim
echo.
pause
