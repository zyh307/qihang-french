@echo off
setlocal
if not exist "%~dp0.venv\Scripts\python.exe" (
  echo Install the desktop speaking service first. See oral-assistant/README.md.
  pause
  exit /b 1
)
"%~dp0.venv\Scripts\python.exe" -X utf8 "%~dp0launch.py" --daily %*
if errorlevel 1 pause
