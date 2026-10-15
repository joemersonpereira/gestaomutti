@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================================
echo   Gravando a sessao do portal da REDE
echo ============================================================
echo.
echo   1. Vai abrir um navegador limpo.
echo   2. Faca o login normalmente (inclusive o SMS, se pedir).
echo   3. Navegue ate a tela de RECEBIMENTOS.
echo   4. Pode deixar: o script percebe que voce entrou,
echo      grava a sessao e fecha o navegador sozinho.
echo      (se quiser gravar na hora, aperte ENTER aqui)
echo.
node gravar-sessao.js rede
echo.
echo Pronto. Volte para a conversa e avise.
pause
