@echo off
echo Iniciando Servidor Ferreteria...
start /b node server.js
timeout /t 2 >nul
start http://localhost:3000
echo Todo listo. Podes cerrar esta ventana cuando quieras detener el sistema.
pause
