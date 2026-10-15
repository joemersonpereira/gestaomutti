@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================================
echo   Instalar o coletor de cartoes nesta maquina
echo ============================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo   [X] Node.js nao esta instalado.
  echo.
  echo       Baixe em https://nodejs.org  ^(versao 20 ou maior^),
  echo       instale clicando em Avancar ate o fim, e rode este
  echo       arquivo de novo.
  goto :fim
)
for /f "tokens=*" %%v in ('node -v') do echo   [ok] Node.js %%v

echo.
echo   Instalando as dependencias... ^(demora alguns minutos^)
call npm install
if errorlevel 1 (
  echo   [X] Falhou o npm install. Confira a internet e tente de novo.
  goto :fim
)

echo.
echo   Instalando o navegador que o robo usa...
call npx playwright install chromium
if errorlevel 1 (
  echo   [X] Falhou a instalacao do navegador.
  goto :fim
)

if not exist ".env" (
  copy ".env.exemplo" ".env" >nul
  echo.
  echo   [!] Criei o arquivo .env a partir do exemplo.
  echo       ABRA ELE no Bloco de Notas e preencha:
  echo         COLETOR_EMAIL  - usuario do SISTEMA Mutti ^(perfil Tesouraria^)
  echo         COLETOR_SENHA  - a senha desse usuario do sistema
  echo         COLETOR_API    - o endereco da API
  echo.
  echo       ATENCAO: aqui NAO vai senha de operadora de cartao.
) else (
  echo   [ok] .env ja existe
)

echo.
echo   ---------------------------------------------------------
echo   Instalado. Agora, nesta ordem:
echo.
echo     1. Preencha o .env  ^(Bloco de Notas^)
echo     2. GRAVAR-SESSAO.bat   - login uma vez em cada portal
echo     3. Teste:  npm run coletar -- brasilcard --ver
echo     4. AGENDAR-COLETA.bat  - liga a coleta das 07:00
echo   ---------------------------------------------------------

:fim
echo.
pause
