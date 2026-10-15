@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo == Fazendo backup agora ==
node src/db/backup.js
echo.
pause
