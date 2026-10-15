@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo == Instalando rotina de BACKUP DIARIO as 00:00 ==
schtasks /create /tn "MuttiBackupDiario" /tr "\"%~dp0BACKUP.bat\"" /sc daily /st 00:00 /f
echo.
echo Se aparecer ERRO de acesso negado: feche, clique com o BOTAO DIREITO neste arquivo
echo e escolha "Executar como administrador".
echo.
pause
