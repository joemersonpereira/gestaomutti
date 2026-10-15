@echo off
chcp 65001 >nul
echo == Removendo a rotina de backup diario ==
schtasks /delete /tn "MuttiBackupDiario" /f
echo.
pause
