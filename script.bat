@echo off
setlocal enabledelayedexpansion

REM Defina as pastas a serem processadas
set PASTAS=app\file-cleaner app\image-processor app\pdf-merger app\pdf-splitter ihatepdf
set HOME_DIR=%cd%

REM Loop pelas pastas
for %%p in (%PASTAS%) do (
    echo Processing %%p
    cd /d "%HOME_DIR%\%%p"
    if exist package.json (
        if exist node_modules (
            echo node_modules already exists, skipping installation
        ) else (
            echo Installing node modules for %%p
            call npm install
        )
    ) else (
        echo No package.json found in %%p
    )
    cd /d "%HOME_DIR%"
    echo Finished processing %%p
    echo ----------------------------------------
)

echo Compiling frontend
cd /d "%HOME_DIR%\ihatepdf"
if not exist ".next\static\chunks\pages" (
    call npm run build
    if errorlevel 1 (
        echo Failed to build frontend
        exit /b 1
    )
    echo Frontend compiled successfully
) else (
    echo compiled frontend already exists, skipping build
    echo If you want to recompile, delete the .next folder in ihatepdf
    echo and run this script again
)
cd /d "%HOME_DIR%"

REM Verifica se já existe um container rodando com nome que contenha "serverles-front-nest"
for /f "tokens=*" %%i in ('docker ps --format "{{.Names}}"') do (
    echo %%i | findstr /i "serverles-front-nest" >nul
    if not errorlevel 1 (
        echo O container serverles-front-nest já está rodando. Projeto já está em execução.
        goto :FIM
    )
)

REM Sobe os containers
docker compose up -d
if errorlevel 1 (
    echo Failed to start Docker containers
    exit /b 1
)
echo Docker containers iniciados com sucesso.

REM Aguarda o LocalStack ficar pronto monitorando os logs
echo Aguardando o LocalStack iniciar (procurando por 'AWS resources setup complete! 🚀' ou 'Ready.')...
for /f "tokens=*" %%i in ('docker ps --filter "name=localstack" --format "{{.ID}}"') do set LOCALSTACK_ID=%%i

:WAITLOGS
for /f "delims=" %%l in ('docker logs --tail 2 %LOCALSTACK_ID% 2^>nul') do (
    echo %%l
    echo %%l | findstr /c:"AWS resources setup complete! 🚀" >nul && goto :FIM
    echo %%l | findstr /c:"Ready." >nul && goto :FIM
)
timeout /t 2 >nul
goto :WAITLOGS

:FIM
echo All tasks completed successfully
endlocal