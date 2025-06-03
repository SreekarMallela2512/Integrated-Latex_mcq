@echo off
echo Starting MCQ Application Services...

:: Start Classifier API
start "Classifier API" cmd /k "cd Automated-Question-classify && pip install -r requirements.txt && uvicorn main:app --reload --port 8000"

:: Wait 5 seconds
timeout /t 5

:: Start LaTeX MCQ App
start "LaTeX MCQ App" cmd /k "cd latex-mcq && npm install && node server.js"

echo.
echo Services started!
echo - Classifier API: http://localhost:8000
echo - MCQ Application: http://localhost:3000
echo.
echo Press any key to close this window (services will keep running)...
pause