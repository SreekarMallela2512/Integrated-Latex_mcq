const sessionId = "session-" + Date.now();

async function classify() {
  const question = document.getElementById("question").value;
  const resultDiv = document.getElementById("result");
  const historyList = document.getElementById("history");

  resultDiv.innerHTML = "Classifying...";
  
  const response = await fetch("http://localhost:8000/classify", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      session_id: sessionId,
      question: question
    })
  });

  const data = await response.json();

  resultDiv.innerHTML = `Difficulty: <strong>${data.difficulty}</strong>`;

  // Update history
  historyList.innerHTML = "";
  data.history.forEach(entry => {
    const li = document.createElement("li");
    li.textContent = `Q: ${entry.question} → ${entry.difficulty}`;
    historyList.appendChild(li);
  });
}
