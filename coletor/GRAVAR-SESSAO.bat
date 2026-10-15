@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================================
echo   Gravar a sessao de um portal de cartao
echo ============================================================
echo.
echo   Portais disponiveis:
echo.
echo     rede         - meu.userede.com.br
echo     brasilcard   - brasilcard.net       (o maior convenio)
echo     mulvi        - mulvipay.com.br      (Banese Card)
echo     alelo        - meuestabelecimento.alelo.com.br
echo     lecard       - cartao.lecard.com.br
echo     uze          - cartao.algorix.com/redeuze
echo     nutricash    - gis.nutricash.com.br
echo     bracov       - www1.tln.com.br      (sessao expira em 30 min)
echo.
set /p PORTAL=Qual portal?
echo.
echo   1. Vai abrir um navegador limpo.
echo   2. Faca o login normalmente (inclusive o SMS, se pedir).
echo   3. Navegue ate a tela do relatorio.
echo   4. Pode deixar: o script percebe que voce entrou,
echo      grava a sessao e fecha o navegador sozinho.
echo      (se quiser gravar na hora, aperte ENTER aqui)
echo.
node gravar-sessao.js %PORTAL%
echo.
echo Pronto. Volte para a conversa e avise.
pause
