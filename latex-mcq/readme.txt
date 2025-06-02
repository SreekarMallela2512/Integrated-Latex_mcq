
 MCQ LaTeX Web App (Submit & Store Only)

A basic web application that allows users to:

- Submit MCQ questions in LaTeX format
- Store MCQs with metadata like subject, topic, difficulty, etc.
- Preview the question and options using MathJax LaTeX rendering
- Save MCQs to MongoDB

---

📁 Folder Structure

```

mcq-latex-app/
├── public/
│   ├── index.html        # Form to add MCQs
│   ├── style.css         # Basic styling
├── mcqModel.js           # Mongoose schema
├── server.js             # Express server
├── package.json
├── README.md             # Project instructions

````

---

## 🚀 Setup Instructions

### 1. 📦 Install Dependencies

```bash
npm install
````

---

### 2. 🧱 Start MongoDB

Ensure MongoDB is installed and running on your machine.

#### On Windows:
bash
net start MongoDB
### 3. 🧠 Start the Web Server

```bash
node server.js
```

Server will start at:

> 📡 [http://localhost:3000](http://localhost:3000)

---

## ✏️ Features

### ➕ Submit MCQ

Go to:

```
http://localhost:3000/
```

* Input question and options in **LaTeX** format
* Select subject, topic, and difficulty
* See a live LaTeX preview (via **MathJax**)
* Submit the question to store it in **MongoDB**

---

## 📚 Technologies Used

* Node.js
* Express.js
* MongoDB (with Mongoose)
* HTML & CSS
* MathJax (for LaTeX rendering)

---

## 🧪 Optional Debug

To confirm that data is being saved in MongoDB:

### Option 1: MongoDB Shell

```bash
mongosh
use mcqdb
db.mcqs.find().pretty()
```

### Option 2: MongoDB Compass GUI

* Connect to: `mongodb://localhost:27017`
* Browse `mcqdb > mcqs` collection

---

## 📄 License

MIT License – Free for personal and commercial use.

```

---

Let me know if you'd like a version of this `README.md` that includes screenshots or deployment instructions.
```
