@echo off
rem Versao sem "pause" - e esta que a tarefa agendada do Windows chama, todo dia as 10:00.
rem
rem Faz duas coisas, nesta ordem:
rem   1. o robo baixa dos portais onde ele consegue entrar
rem   2. importa o que voce baixou a mao e deixou em entrada\vendas ou entrada\repasse
cd /d "%~dp0"
node coletar.js >> "logs\agendado.log" 2>&1
node importar-pasta.js >> "logs\agendado.log" 2>&1
