@echo off
chcp 65001 >nul
title FerrePro - Lanzador
color 0E

echo ============================================
echo    FerrePro - Sistema de Gestion
echo ============================================
echo.

REM Verificar que Node este instalado
where node >nul 2>nul
if errorlevel 1 (
    echo  [ERROR] No se encontro Node.js.
    echo  Instalalo desde https://nodejs.org (version LTS) y volve a intentar.
    echo.
    pause
    exit /b
)

REM Verificar que las dependencias esten instaladas
if not exist "node_modules" (
    echo  Primera vez: instalando dependencias, esto puede tardar 1-2 minutos...
    echo.
    call npm install
    echo.
)

echo  Iniciando el servidor en una ventana aparte...
echo  (Ahi vas a ver la direccion IP para tablets y celulares)
echo.

REM Arrancar el servidor en su propia ventana (muestra la IP de acceso)
start "FerrePro - Servidor (NO CERRAR mientras se usa)" cmd /k node server.js

REM Esperar a que levante y abrir el navegador en esta PC
timeout /t 3 >nul
echo  Abriendo el navegador...
start "" http://localhost:3000

echo.
echo ------------------------------------------------------------
echo  LISTO.
echo.
echo  - En esta PC ya se abrio el navegador (http://localhost:3000).
echo.
echo  - Para usarlo desde una TABLET o CELULAR conectados al mismo
echo    Wi-Fi, abri el navegador del dispositivo y escribi la
echo    direccion IP que figura en la ventana del SERVIDOR
echo    (algo como  http://192.168.1.105:3000 ).
echo.
echo  - Para DETENER el sistema: cerra la ventana del SERVIDOR.
echo ------------------------------------------------------------
echo.
echo  Podes cerrar ESTA ventana (la del servidor tiene que quedar abierta).
pause
