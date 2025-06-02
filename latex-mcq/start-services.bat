@echo off
echo Starting services...

:: Start Classifier API
start cmd /k "cd Automated-Question-classify && pip install -r requirements.txt && uvicorn main:app --reload --port 8000"

:: Wait a bit
timeout /t 5

:: Start LaTeX MCQ
start cmd /k "cd latex-mcq && npm install && node server.js"

echo Services started!
echo Classifier API: http://localhost:8000
echo MCQ App: http://localhost:3000
pause