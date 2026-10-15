@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================================
echo   Instalar o sistema Mutti nesta maquina
echo ============================================================
echo.
echo   Vai instalar o sistema INTEIRO aqui: a tela, a API e o
echo   robo que baixa os relatorios de cartao.
echo.
echo   Depois disso, qualquer computador do escritorio acessa
echo   pelo endereco desta maquina na rede.
echo.
pause

where node >nul 2>&1
if errorlevel 1 (
  echo   [X] Node.js nao esta instalado.
  echo       Baixe em https://nodejs.org ^(versao 20 ou maior^) e rode de novo.
  goto :fim
)
for /f "tokens=*" %%v in ('node -v') do echo   [ok] Node.js %%v

echo.
echo   [1/5] Backend...
cd backend
call npm install
if errorlevel 1 goto :erro

if not exist ".env" (
  copy ".env.example" ".env" >nul
  echo.
  echo   [!] Criei backend\.env a partir do exemplo.
  echo       PRECISA preencher antes de continuar:
  echo         JWT_SECRET   - qualquer frase longa e unica
  echo         ERP_HOST     - 163.176.163.130
  echo         ERP_USER / ERP_PASSWORD  - o usuario somente leitura do ERP
  echo.
  echo       Abra o arquivo, preencha, salve, e rode este .bat de novo.
  notepad .env
  goto :fim
)
echo   [ok] backend\.env existe

echo.
echo   [2/5] Criando o banco e rodando as migracoes...
call node src\db\setup.js
call node src\db\migrar-pendentes.js
if errorlevel 1 goto :erro

echo.
echo   [3/5] Frontend...
cd ..\frontend
if exist "build\index.html" (
  echo   [ok] a tela ja veio pronta no pacote - pulando
  echo        ^(economiza uns 10 minutos e 378 MB de download^)
) else (
  call npm install
  if errorlevel 1 goto :erro
  call npm run build
  if errorlevel 1 goto :erro
)

echo.
echo   [4/5] Robo dos cartoes...
cd ..\coletor
call npm install
if errorlevel 1 goto :erro
call npx playwright install chromium
if not exist ".env" copy ".env.exemplo" ".env" >nul

echo.
echo   [5/5] Descobrindo o endereco desta maquina na rede...
cd ..
for /f "tokens=2 delims=:" %%i in ('ipconfig ^| findstr /c:"IPv4"') do (
  for /f "tokens=1" %%j in ("%%i") do set IP=%%j
)

echo.
echo   ---------------------------------------------------------
echo   Instalado.
echo.
echo   O sistema vai responder em:
echo       http://%IP%:3001        ^<- use este no escritorio
echo       http://localhost:3001   ^<- aqui nesta maquina
echo.
echo   Agora, nesta ordem:
echo     1. INICIAR-SISTEMA.bat            - liga o servidor
echo     2. coletor\GRAVAR-SESSAO.bat      - login uma vez em cada portal
echo     3. coletor\AGENDAR-COLETA.bat     - liga a coleta das 07:00
echo   ---------------------------------------------------------
goto :fim

:erro
echo.
echo   [X] Algo falhou acima. Leia a ultima mensagem de erro.

:fim
echo.
pause
