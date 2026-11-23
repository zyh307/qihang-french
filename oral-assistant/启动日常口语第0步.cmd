@echo off
setlocal
"%~dp0.venv\Scripts\python.exe" -X utf8 "%~dp0scripts\preview_daily_practice.py" %*
