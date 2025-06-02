from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict
import re

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

step_indicators = {
    'first': 1, 'then': 1, 'after that': 1, 'finally': 1, 'substitute': 1,
    'simplify': 1, 'solve': 1, 'calculate': 1, 'differentiate': 2,
    'integrate': 2, 'derive': 2, 'determine': 1, 'evaluate': 2,
    'apply': 1, 'use': 1, 'based on': 1
}

math_symbols = [r'\\int', r'\\sum', r'\\frac', r'\\sqrt', r'\\lim', r'\\theta', r'\\alpha', r'\\beta', r'\\gamma', r'\\Delta', r'\\infty']

class DifficultyRequest(BaseModel):
    session_id: str
    question: str

class DifficultyResponse(BaseModel):
    difficulty: str
    history: List[Dict[str, str]]

chat_histories: Dict[str, List[Dict[str, str]]] = {}

def estimate_steps(question: str) -> int:
    question_lower = question.lower()
    step_score = 0

    # Match phrases
    for phrase, score in step_indicators.items():
        if phrase in question_lower:
            step_score += score

    # Estimate from sentence count
    sentence_count = len(re.split(r'[.;:?!]', question_lower))
    if sentence_count >= 3:
        step_score += sentence_count // 2

    # Count math symbols
    symbol_count = sum(len(re.findall(symbol, question)) for symbol in math_symbols)
    step_score += min(symbol_count, 3)

    # Word length contribution
    word_count = len(question_lower.split())
    if word_count > 40:
        step_score += 2
    elif word_count > 25:
        step_score += 1

    return step_score

def classify_by_steps(step_score: int) -> str:
    if step_score >= 6:
        return "Hard"
    elif step_score >= 4:
        return "Medium"
    else:
        return "Easy"

@app.post("/classify", response_model=DifficultyResponse)
async def classify_question(request: DifficultyRequest):
    if request.session_id not in chat_histories:
        chat_histories[request.session_id] = []

    step_score = estimate_steps(request.question)
    difficulty = classify_by_steps(step_score)

    print(f"Question: {request.question[:100]}...")
    print(f"Step Score: {step_score}")
    print(f"Classified as: {difficulty}")
    print("-" * 50)

    chat_histories[request.session_id].append({
        "question": request.question[:100] + "..." if len(request.question) > 100 else request.question,
        "difficulty": difficulty
    })

    return DifficultyResponse(
        difficulty=difficulty,
        history=chat_histories[request.session_id]
    )

@app.get("/stats/{session_id}")
async def get_session_stats(session_id: str):
    if session_id not in chat_histories:
        return {"error": "Session not found"}

    history = chat_histories[session_id]
    total = len(history)

    if total == 0:
        return {"total": 0}

    easy_count = sum(1 for entry in history if entry["difficulty"] == "Easy")
    medium_count = sum(1 for entry in history if entry["difficulty"] == "Medium")
    hard_count = sum(1 for entry in history if entry["difficulty"] == "Hard")

    return {
        "total": total,
        "easy": {"count": easy_count, "percentage": round(easy_count/total*100, 1)},
        "medium": {"count": medium_count, "percentage": round(medium_count/total*100, 1)},
        "hard": {"count": hard_count, "percentage": round(hard_count/total*100, 1)},
        "distribution": "Ideal JEE Main: Easy(30%), Medium(50%), Hard(20%)"
    }
