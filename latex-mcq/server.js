require('dotenv').config();
// At the top of server.js, after require statements
console.log('=== Environment Variables ===');
console.log('CLASSIFIER_URL:', process.env.CLASSIFIER_URL);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('===========================');
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const axios = require('axios');
const path = require('path');

// Import models
const MCQ = require('./mcqModel');
const User = require('./userModel');
const Year = require('./yearModel');
const ExamDate = require('./examDateModel');

const app = express();

// Get port from environment variable (Render sets this)
const PORT = process.env.PORT || 3000;
const CLASSIFIER_URL = process.env.CLASSIFIER_URL;

// MongoDB connection with retry logic
const connectWithRetry = () => {
  mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  }).then(() => {
    console.log('✅ Connected to MongoDB Atlas');
  }).catch(err => {
    console.error('❌ MongoDB connection error:', err.message);
    console.log('Retrying in 5 seconds...');
    setTimeout(connectWithRetry, 5000);
  });
};

connectWithRetry();

// Session configuration
// Session configuration - UPDATE THIS PART
// Session configuration - FIXED VERSION
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-this',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    touchAfter: 24 * 3600
  }),
  cookie: {
    secure: false, // Set to false for development, true for production with HTTPS
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: 'lax' // Change from 'strict' to 'lax'
  }
}));

// Add this BEFORE session middleware to trust proxy
app.set('trust proxy', 1); // Trust first proxy

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Health check endpoint for Render
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    service: 'mcq-latex-web',
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Root endpoint
app.get('/api', (req, res) => {
  res.json({ 
    message: 'MCQ LaTeX Web Service', 
    version: '1.0.0',
    endpoints: {
      health: '/health',
      auth: '/auth/status',
      questions: '/questions'
    }
  });
});

// Middleware to check authentication
const requireAuth = (req, res, next) => {
  if (req.session.userId) {
    next();
  } else {
    res.status(401).json({ error: 'Authentication required' });
  }
};

// Middleware to check super user role
const requireSuperUser = (req, res, next) => {
  if (req.session.userId && req.session.userRole === 'superuser') {
    next();
  } else {
    res.status(403).json({ error: 'Super user access required' });
  }
};

// Authentication routes
app.post('/register', async (req, res) => {
  try {
    const { username, email, password, role } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { username }]
    });
    
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }
    
    const user = new User({ username, email, password, role: role || 'user' });
    await user.save();
    
    res.json({ message: 'User registered successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/login', async (req, res) => {
  try {
    console.log('Login attempt:', req.body.username);
    const { username, password } = req.body;
    
    const user = await User.findOne({
      $or: [{ username }, { email: username }]
    });
    
    if (!user || !(await user.comparePassword(password))) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    
    // Set session data
    req.session.userId = user._id;
    req.session.username = user.username;
    req.session.userRole = user.role;
    
    // Force session save
    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.status(500).json({ error: 'Session save failed' });
      }
      
      console.log('Session saved:', {
        sessionId: req.sessionID,
        userId: req.session.userId,
        userRole: req.session.userRole
      });
      
      res.json({
        message: 'Login successful',
        user: {
          id: user._id,
          username: user.username,
          role: user.role
        }
      });
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ message: 'Logout successful' });
  });
});

// Check authentication status
app.get('/auth/status', (req, res) => {
  console.log('Auth check:', {
    sessionId: req.sessionID,
    userId: req.session.userId,
    cookies: req.headers.cookie
  });
  
  if (req.session.userId) {
    res.json({
      authenticated: true,
      user: {
        id: req.session.userId,
        username: req.session.username,
        role: req.session.userRole
      }
    });
  } else {
    res.json({ authenticated: false });
  }
});
// Trust proxy BEFORE session middleware
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Session configuration
const sessionConfig = {
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-this',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    touchAfter: 24 * 3600,
    crypto: {
      secret: process.env.SESSION_SECRET || 'your-secret-key-change-this'
    }
  }),
  cookie: {
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  }
};

// Set secure cookies only in production with HTTPS
if (process.env.NODE_ENV === 'production') {
  sessionConfig.cookie.secure = true;
}

app.use(session(sessionConfig));
// MCQ submission route - UPDATED WITH SOLUTION FIELD
app.post('/submit', requireAuth, async (req, res) => {
  try {
    console.log("=== Submit Request Started ===");
    console.log("User ID:", req.session.userId);
    console.log("Request body:", JSON.stringify(req.body, null, 2));

    const {
      questionNo, question, options, correctOption,
      subject, topic, difficulty: userDifficulty,
      pyqType, shift, year, examDate,
      autoClassified,
      solution
    } = req.body;

    // Trim question to remove accidental space differences
    const trimmedQuestion = question.trim();

    // 🔍 Check for duplicate question
    const duplicateQuestion = await MCQ.findOne({ question: trimmedQuestion });
    if (duplicateQuestion) {
      return res.status(400).json({ error: 'This question already exists in the database.' });
    }

    if (!trimmedQuestion || !options || options.length !== 4) {
      console.error("Validation failed: Missing question or options");
      return res.status(400).json({ error: 'Question and 4 options are required' });
    }

    if (pyqType === 'JEE MAIN PYQ') {
      if (!shift || !year) {
        return res.status(400).json({ error: 'Shift and Year are required for JEE MAIN PYQ questions' });
      }
      const yearNum = parseInt(year, 10);
      if (yearNum < 1000) {
        return res.status(400).json({ error: 'Invalid year. Year must be a 4-digit number (minimum 1000).' });
      }
    }

    const correctOptionIndex = parseInt(correctOption, 10) - 1;
    console.log("Correct option index:", correctOptionIndex);

    const mcqData = {
      questionNo,
      question: trimmedQuestion,
      options,
      correctOption: correctOptionIndex,
      subject,
      topic,
      difficulty: req.session.userRole === 'superuser' ? userDifficulty.toLowerCase() : (autoClassified ? data.difficulty.toLowerCase() : 'easy'), // Allow superuser to manually set difficulty
      solution: solution || '',
      pyqType: pyqType || 'Not PYQ',
      createdBy: req.session.userId,
      autoClassified: Boolean(autoClassified)
    };

    console.log("Initial MCQ data:", JSON.stringify(mcqData, null, 2));

    if (pyqType === 'JEE MAIN PYQ') {
      mcqData.shift = shift;
      mcqData.year = parseInt(year, 10);
      if (examDate) mcqData.examDate = new Date(examDate);
    }

    if (mcqData.autoClassified && CLASSIFIER_URL) {
      try {
        console.log("Starting auto-classification...");
        const resp = await axios.post(
          `${CLASSIFIER_URL}/classify`,
          { session_id: req.sessionID, question: trimmedQuestion },
          { timeout: 45000 }
        );
        mcqData.difficulty = resp.data.difficulty;
        console.log("✅ Auto-classified as:", mcqData.difficulty);
      } catch (err) {
        console.error("⚠️ Auto-classify failed:", err.message);
      }
    }

    console.log("Final MCQ data before save:", JSON.stringify(mcqData, null, 2));

    try {
      const mcq = new MCQ(mcqData);
      const savedMcq = await mcq.save();
      console.log("✅ Successfully saved MCQ with ID:", savedMcq._id);

      res.json({
        message: "Question added successfully!",
        questionId: savedMcq._id,
        difficulty: mcqData.difficulty,
        wasAutoClassified: mcqData.autoClassified
      });

    } catch (mongoError) {
      console.error("❌ MongoDB Save Error:", mongoError);

      if (mongoError.code === 11000 && mongoError.keyPattern?.questionNo) {
        return res.status(400).json({ error: 'Duplicate Question Number. Please refresh and try again.' });
      }

      if (mongoError.name === 'ValidationError') {
        const errors = Object.keys(mongoError.errors).map(key =>
          `${key}: ${mongoError.errors[key].message}`
        ).join(', ');
        return res.status(400).json({ error: `Validation failed: ${errors}` });
      }

      throw mongoError;
    }

  } catch (err) {
    console.error('❌ Submit endpoint error:', err);
    res.status(500).json({ error: "Error saving question. Please try again." });
  }
});

app.get('/generate-serial/:year/:date/:shift', requireAuth, async (req, res) => {
  const { year, date, shift } = req.params;

  if (!year || !date || !shift) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  const dateObj = new Date(date);
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  const dateStr = `${month}${day}`;
  const shiftCode = shift === 'Shift 1' ? 'S1' : 'S2';

  const baseSerial = `${year}-${dateStr}-${shiftCode}`;

  try {
    const regex = new RegExp(`^${baseSerial}-\\d{3}$`);
    const existing = await MCQ.find({ questionNo: { $regex: regex } }).select('questionNo');

    // Extract used numbers
    const usedNumbers = new Set();
    existing.forEach(q => {
      const parts = q.questionNo.split('-');
      const last = parts[parts.length - 1];
      if (/^\d+$/.test(last)) {
        usedNumbers.add(parseInt(last));
      }
    });

    // Find first unused number
    let nextNum = 1;
    while (usedNumbers.has(nextNum)) {
      nextNum++;
    }

    const serial = `${baseSerial}-${String(nextNum).padStart(3, '0')}`;
    return res.json({ serial });
  } catch (err) {
    console.error('Serial generation error:', err);
    res.status(500).json({ error: 'Failed to generate serial' });
  }
});

// Get questions based on user role with enhanced filtering and sorting - UPDATED
app.get('/questions', requireAuth, async (req, res) => {
  try {
    const { subject, pyqType, year, shift, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    
    let filter = {};
    let questions;
    
    // Build filter based on user role
    if (req.session.userRole === 'superuser') {
      // Super users can see all questions
      if (subject) filter.subject = subject;
      if (pyqType && pyqType !== 'all') filter.pyqType = pyqType;
      if (year) filter.year = parseInt(year);
      if (shift) filter.shift = shift;
    } else {
      // Regular users can only see their own questions
      filter.createdBy = req.session.userId;
      if (subject) filter.subject = subject;
      if (pyqType && pyqType !== 'all') filter.pyqType = pyqType;
      if (year) filter.year = parseInt(year);
      if (shift) filter.shift = shift;
    }

    // Create sort object - default to newest first
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    if (req.session.userRole === 'superuser') {
      questions = await MCQ.find(filter)
        .populate('createdBy', 'username')
        .sort(sort)
        .lean(); // Use lean() for better performance
    } else {
      questions = await MCQ.find(filter)
        .sort(sort)
        .lean();
    }     // Ensure createdAt is included in response and include solution field
    questions = questions.map(q => ({
      ...q,
      createdAt: q.createdAt || q._id.getTimestamp(), // Fallback to ObjectId timestamp if createdAt is missing
      solution: q.solution || '' // Ensure solution field is included
    }));
    
    res.json(questions);
  } catch (err) {
    console.error('Error fetching questions:', err);
    res.status(500).json({ error: "Error fetching questions." });
  }
});

// Get single question by ID (for editing) - UPDATED WITH SOLUTION
app.get('/questions/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    let filter = { _id: id };
    
    // Regular users can only access their own questions
    if (req.session.userRole !== 'superuser') {
      filter.createdBy = req.session.userId;
    }
    
    const question = await MCQ.findOne(filter);
    
    if (!question) {
      return res.status(404).json({ error: 'Question not found or access denied' });
    }
    
    // Ensure solution is included in the response
    const questionData = {
      _id: question._id,
      questionNo: question.questionNo,
      question: question.question,
      options: question.options,
      correctOption: question.correctOption,
      subject: question.subject,
      topic: question.topic,
      difficulty: question.difficulty,
      solution: question.solution || '', // Include solution
      pyqType: question.pyqType,
      shift: question.shift,
      year: question.year,
      examDate: question.examDate,
      autoClassified: question.autoClassified,
      createdBy: question.createdBy,
      createdAt: question.createdAt
    };
    
    res.json(questionData);
  } catch (err) {
    console.error('Error fetching question:', err);
    res.status(500).json({ error: 'Error fetching question' });
  }
});

// Update question (only own questions for regular users) - UPDATED WITH SOLUTION
app.put('/questions/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    // Convert correctOption to 0-based index if it's 1-based
    if (updateData.correctOption && typeof updateData.correctOption === 'string') {
      updateData.correctOption = parseInt(updateData.correctOption) - 1;
    }
    
    // Ensure solution is included in update data
    if (!updateData.hasOwnProperty('solution')) {
      updateData.solution = ''; // Default to empty string if not provided
    }
    
    let filter = { _id: id };
    
    // Regular users can only update their own questions
    if (req.session.userRole !== 'superuser') {
      filter.createdBy = req.session.userId;
    }
     if (req.session.userRole === 'superuser') {
      updateData.difficulty = updateData.difficulty.toLowerCase();
    }
    
    const updatedQuestion = await MCQ.findOneAndUpdate(
      filter, 
      updateData, 
      { new: true, runValidators: true }
    );
    
    if (!updatedQuestion) {
      return res.status(404).json({ error: 'Question not found or access denied' });
    }
    
    res.json({ 
      message: 'Question updated successfully', 
      question: updatedQuestion 
    });
  } catch (err) {
    console.error('Error updating question:', err);
    res.status(500).json({ error: 'Error updating question' });
  }
});
// Get rejected questions (supremeuser only)


// Delete question (only own questions for regular users) - NO CHANGES NEEDED
app.delete('/questions/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    let filter = { _id: id };
    
    // Regular users can only delete their own questions
    if (req.session.userRole !== 'superuser') {
      filter.createdBy = req.session.userId;
    }
    
    const deletedQuestion = await MCQ.findOneAndDelete(filter);
    
    if (!deletedQuestion) {
      return res.status(404).json({ error: 'Question not found or access denied' });
    }
    
    res.json({ message: 'Question deleted successfully' });
  } catch (err) {
    console.error('Error deleting question:', err);
    res.status(500).json({ error: 'Error deleting question' });
  }
});

// Get question statistics - UPDATED TO INCLUDE SOLUTION STATS
app.get('/stats', requireAuth, async (req, res) => {
  try {
    let matchStage = {};
    
    if (req.session.userRole !== 'superuser') {
      matchStage.createdBy = new mongoose.Types.ObjectId(req.session.userId);
    }

    const stats = await MCQ.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalQuestions: { $sum: 1 },
          questionsWithSolutions: { 
            $sum: { 
              $cond: [{ $and: [{ $ne: ["$solution", ""] }, { $ne: ["$solution", null] }] }, 1, 0] 
            } 
          },
          subjectBreakdown: {
            $push: {
              subject: "$subject",
              pyqType: "$pyqType",
              difficulty: "$difficulty"
            }
          }
        }
      },
      {
        $project: {
          totalQuestions: 1,
          questionsWithSolutions: 1,
          solutionPercentage: {
            $multiply: [
              { $divide: ["$questionsWithSolutions", "$totalQuestions"] },
              100
            ]
          },
          subjects: {
            $reduce: {
              input: "$subjectBreakdown",
              initialValue: {},
              in: {
                $mergeObjects: [
                  "$$value",
                  {
                    $arrayToObject: [[{
                      k: "$$this.subject",
                      v: { $add: [{ $ifNull: [{ $getField: { field: "$$this.subject", input: "$$value" } }, 0] }, 1] }
                    }]]
                  }
                ]
              }
            }
          },
          pyqTypes: {
            $reduce: {
              input: "$subjectBreakdown",
              initialValue: {},
              in: {
                $mergeObjects: [
                  "$$value",
                  {
                    $arrayToObject: [[{
                      k: "$$this.pyqType",
                      v: { $add: [{ $ifNull: [{ $getField: { field: "$$this.pyqType", input: "$$value" } }, 0] }, 1] }
                    }]]
                  }
                ]
              }
            }
          },
          difficulties: {
            $reduce: {
              input: "$subjectBreakdown",
              initialValue: {},
              in: {
                $mergeObjects: [
                  "$$value",
                  {
                    $arrayToObject: [[{
                      k: "$$this.difficulty",
                      v: { $add: [{ $ifNull: [{ $getField: { field: "$$this.difficulty", input: "$$value" } }, 0] }, 1] }
                    }]]
                  }
                ]
              }
            }
          }
        }
      }
    ]);

    res.json(stats[0] || { 
      totalQuestions: 0, 
      questionsWithSolutions: 0,
      solutionPercentage: 0,
      subjects: {}, 
      pyqTypes: {}, 
      difficulties: {} 
    });
  } catch (err) {
    console.error('Error fetching stats:', err);
    res.status(500).json({ error: "Error fetching statistics." });
  }
});

// Super user only route to get all users - NO CHANGES NEEDED
app.get('/users', requireSuperUser, async (req, res) => {
  try {
    const users = await User.find().select('-password');
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error fetching users' });
  }
});

// Get unique years from database for filtering - NO CHANGES NEEDED
app.get('/available-years', requireAuth, async (req, res) => {
  try {
    let matchStage = { year: { $exists: true, $ne: null } };
    
    if (req.session.userRole !== 'superuser') {
      matchStage.createdBy = new mongoose.Types.ObjectId(req.session.userId);
    }

    const years = await MCQ.distinct('year', matchStage);
    res.json(years.sort((a, b) => b - a)); // Sort descending
  } catch (err) {
    console.error('Error fetching available years:', err);
    res.status(500).json({ error: 'Error fetching available years' });
  }
});

// Helper function to get hardcoded exam dates - NO CHANGES NEEDED
function getHardcodedExamDates(year) {
  const examDates = {
    2025: [
      { date: '2025-01-22', label: 'January 22, 2025' },
      { date: '2025-01-24', label: 'January 24, 2025' },
      { date: '2025-01-29', label: 'January 29, 2025' },
      { date: '2025-01-31', label: 'January 31, 2025' },
      { date: '2025-04-01', label: 'April 1, 2025' },
      { date: '2025-04-04', label: 'April 4, 2025' },
      { date: '2025-04-08', label: 'April 8, 2025' },
      { date: '2025-04-12', label: 'April 12, 2025' }
    ],
    2024: [
      { date: '2024-01-27', label: 'January 27, 2024' },
      { date: '2024-01-29', label: 'January 29, 2024' },
      { date: '2024-01-31', label: 'January 31, 2024' },
      { date: '2024-02-01', label: 'February 1, 2024' },
      { date: '2024-04-04', label: 'April 4, 2024' },
      { date: '2024-04-06', label: 'April 6, 2024' },
      { date: '2024-04-08', label: 'April 8, 2024' },
      { date: '2024-04-09', label: 'April 9, 2024' },
      { date: '2024-04-15', label: 'April 15, 2024' }
    ],
    2023: [
      { date: '2023-01-24', label: 'January 24, 2023' },
      { date: '2023-01-25', label: 'January 25, 2023' },
      { date: '2023-01-29', label: 'January 29, 2023' },
      { date: '2023-01-30', label: 'January 30, 2023' },
      { date: '2023-01-31', label: 'January 31, 2023' },
      { date: '2023-02-01', label: 'February 1, 2023' },
      { date: '2023-04-06', label: 'April 6, 2023' },
      { date: '2023-04-08', label: 'April 8, 2023' },
      { date: '2023-04-10', label: 'April 10, 2023' },
      { date: '2023-04-11', label: 'April 11, 2023' },
      { date: '2023-04-13', label: 'April 13, 2023' },
      { date: '2023-04-15', label: 'April 15, 2023' }
    ],
    2022: [
      { date: '2022-06-23', label: 'June 23, 2022' },
      { date: '2022-06-24', label: 'June 24, 2022' },
      { date: '2022-06-25', label: 'June 25, 2022' },
      { date: '2022-06-26', label: 'June 26, 2022' },
      { date: '2022-06-27', label: 'June 27, 2022' },
      { date: '2022-06-28', label: 'June 28, 2022' },
      { date: '2022-06-29', label: 'June 29, 2022' },
      { date: '2022-07-21', label: 'July 21, 2022' },
      { date: '2022-07-25', label: 'July 25, 2022' },
      { date: '2022-07-28', label: 'July 28, 2022' },
      { date: '2022-07-30', label: 'July 30, 2022' }
    ],
    2021: [
      { date: '2021-02-23', label: 'February 23, 2021' },
      { date: '2021-02-24', label: 'February 24, 2021' },
      { date: '2021-02-25', label: 'February 25, 2021' },
      { date: '2021-02-26', label: 'February 26, 2021' },
            { date: '2021-03-16', label: 'March 16, 2021' },
      { date: '2021-03-17', label: 'March 17, 2021' },
      { date: '2021-03-18', label: 'March 18, 2021' },
      { date: '2021-07-20', label: 'July 20, 2021' },
      { date: '2021-07-22', label: 'July 22, 2021' },
      { date: '2021-07-25', label: 'July 25, 2021' },
      { date: '2021-07-27', label: 'July 27, 2021' },
      { date: '2021-08-26', label: 'August 26, 2021' },
      { date: '2021-08-31', label: 'August 31, 2021' },
      { date: '2021-09-02', label: 'September 2, 2021' }
    ]
  };
  
  return examDates[year] || [];
}

// Year Management Routes (Superuser only) - NO CHANGES NEEDED
app.get('/admin/years', requireSuperUser, async (req, res) => {
  try {
    // Get years from Year collection
    const yearDocs = await Year.find().sort({ year: -1 });
    const storedYears = yearDocs.map(doc => doc.year);
    
    // Default years that should always be available
    const defaultYears = [2021, 2022, 2023, 2024, 2025];
    
    // Combine and sort unique years
    const allYears = [...new Set([...storedYears, ...defaultYears])].sort((a, b) => b - a);
    
    res.json(allYears);
  } catch (err) {
    console.error('Error fetching years:', err);
    res.status(500).json({ error: 'Error fetching years' });
  }
});

// Public route: Get all available years for the frontend dropdown - NO CHANGES NEEDED
app.get('/api/years', async (req, res) => {
  try {
    // Get years from Year collection
    const yearDocs = await Year.find().sort({ year: -1 });
    const storedYears = yearDocs.map(doc => doc.year);
    
    // Default years
    const defaultYears = [2021, 2022, 2023, 2024, 2025];
    
    // Merge and deduplicate
    const combinedYears = [...new Set([...storedYears, ...defaultYears])].sort((a, b) => b - a);

    res.json({ years: combinedYears });
  } catch (err) {
    console.error('Error fetching public years:', err);
    res.status(500).json({ error: 'Failed to fetch years' });
  }
});

app.post('/admin/years', requireSuperUser, async (req, res) => {
  try {
    const { year } = req.body;
    
    if (!year || isNaN(year) || year < 1000) {
      return res.status(400).json({ error: 'Invalid year. Must be a valid number.' });
    }
    
    // Check if year already exists
    const existingYear = await Year.findOne({ year: parseInt(year) });
    if (existingYear) {
      return res.status(400).json({ error: 'Year already exists' });
    }
    
    // Create and save new year
    const newYear = new Year({ year: parseInt(year) });
    await newYear.save();
    
    res.json({ message: 'Year added successfully', year: parseInt(year) });
  } catch (err) {
    console.error('Error adding year:', err);
    res.status(500).json({ error: 'Error adding year' });
  }
});

app.delete('/admin/years/:year', requireSuperUser, async (req, res) => {
  try {
    const { year } = req.params;
    const yearNum = parseInt(year);
    
    // Don't allow deletion of default years
    const defaultYears = [2021, 2022, 2023, 2024, 2025];
    if (defaultYears.includes(yearNum)) {
      return res.status(400).json({ error: 'Cannot delete default years' });
    }
    
    // Check if year is used in existing questions
    const questionsWithYear = await MCQ.countDocuments({ year: yearNum });
    
    if (questionsWithYear > 0) {
      return res.status(400).json({ 
        error: `Cannot delete year ${year}. It is used in ${questionsWithYear} question(s).` 
      });
    }
    
    // Delete from Year collection
    await Year.deleteOne({ year: yearNum });
    
    res.json({ message: `Year ${year} deleted successfully` });
  } catch (err) {
    console.error('Error deleting year:', err);
    res.status(500).json({ error: 'Error deleting year' });
  }
});

// Exam Date Management Routes (Superuser only) - NO CHANGES NEEDED
app.get('/admin/exam-dates/:year', requireSuperUser, async (req, res) => {
  try {
    const { year } = req.params;
    const yearNum = parseInt(year);
    
    // Get exam dates from ExamDate collection
    const storedDates = await ExamDate.find({ year: yearNum }).sort({ date: 1 });
    
    // Get hardcoded exam dates for the year
    const hardcodedDates = getHardcodedExamDates(yearNum);
    
    // Create a map to merge dates
    const dateMap = new Map();
    
    // Add hardcoded dates
    hardcodedDates.forEach(d => {
      dateMap.set(d.date, {
        date: d.date,
        label: d.label
      });
    });
    
    // Add stored dates (will override hardcoded if same date)
    storedDates.forEach(d => {
      dateMap.set(d.date.toISOString().split('T')[0], {
        date: d.date.toISOString().split('T')[0],
        label: d.label
      });
    });
    
    // Convert map to array and sort
    const allDates = Array.from(dateMap.values())
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    
    res.json(allDates);
  } catch (err) {
    console.error('Error fetching exam dates:', err);
    res.status(500).json({ error: 'Error fetching exam dates' });
  }
});
// Get available years for JEE MAIN PYQ
app.get('/api/years-for-pyq', async (req, res) => {
  try {
    const yearDocs = await Year.find().sort({ year: -1 });
    const storedYears = yearDocs.map(doc => doc.year);
    const defaultYears = [2021, 2022, 2023, 2024, 2025];
    const allYears = [...new Set([...storedYears, ...defaultYears])].sort((a, b) => b - a);
    res.json(allYears);
  } catch (err) {
    console.error('Error fetching years for PYQ:', err);
    res.status(500).json({ error: 'Error fetching years' });
  }
});

app.post('/admin/exam-dates', requireSuperUser, async (req, res) => {
  try {
    const { year, date } = req.body;
    
    if (!year || !date) {
      return res.status(400).json({ error: 'Year and date are required' });
    }
    
    const examDate = new Date(date);
    if (isNaN(examDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }
    
    // Check if exam date already exists
    const existingDate = await ExamDate.findOne({ 
      year: parseInt(year), 
      date: examDate 
    });
    
    if (existingDate) {
      return res.status(400).json({ error: 'Exam date already exists for this year' });
    }
    
    // Create label for the date
    const label = examDate.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    
    // Save new exam date
    const newExamDate = new ExamDate({
      year: parseInt(year),
      date: examDate,
      label: label
    });
    
    await newExamDate.save();
    
    res.json({ 
      message: 'Exam date added successfully', 
      examDate: {
        date: date,
        label: label
      }
    });
  } catch (err) {
    console.error('Error adding exam date:', err);
    res.status(500).json({ error: 'Error adding exam date' });
  }
});

app.delete('/admin/exam-dates', requireSuperUser, async (req, res) => {
  try {
    const { year, date } = req.body;
    
    if (!year || !date) {
      return res.status(400).json({ error: 'Year and date are required' });
    }
    
    const examDate = new Date(date);
    const yearNum = parseInt(year);
    
    // Check if it's a hardcoded date
    const hardcodedDates = getHardcodedExamDates(yearNum);
    const isHardcoded = hardcodedDates.some(d => d.date === date);
    
    if (isHardcoded) {
      return res.status(400).json({ error: 'Cannot delete default exam dates' });
    }
    
    // Check if date is used in existing questions
    const questionsWithDate = await MCQ.countDocuments({ 
      year: yearNum,
      examDate: examDate
    });
    
    if (questionsWithDate > 0) {
      return res.status(400).json({ 
        error: `Cannot delete this exam date. It is used in ${questionsWithDate} question(s).` 
      });
    }
    
    // Delete from ExamDate collection
    await ExamDate.deleteOne({ 
      year: yearNum,
      date: examDate
    });
    
    res.json({ message: 'Exam date deleted successfully' });
  } catch (err) {
    console.error('Error deleting exam date:', err);
    res.status(500).json({ error: 'Error deleting exam date' });
  }
});

app.get('/test-classifier-manual', async (req, res) => {
  const results = {};
  
  // Check environment variable
  results.env_check = {
    CLASSIFIER_URL: process.env.CLASSIFIER_URL,
    exists: !!process.env.CLASSIFIER_URL
  };
  
  // Test health endpoint
  try {
    const healthResponse = await axios.get('https://mcq-classifier-g1z9.onrender.com/health');
    results.health_check = {
      success: true,
      data: healthResponse.data
    };
  } catch (err) {
    results.health_check = {
      success: false,
      error: err.message
    };
  }
  
  // Test classify endpoint
  try {
    const classifyResponse = await axios.post(
      'https://mcq-classifier-g1z9.onrender.com/classify',
      {
        session_id: 'test-' + Date.now(),
        question: 'What is the derivative of x^2?'
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000
      }
    );
    results.classify_check = {
      success: true,
      data: classifyResponse.data
    };
  } catch (err) {
    results.classify_check = {
      success: false,
      error: err.message,
      response: err.response?.data
    };
  }
  
  res.json(results);
});

// Public route: Get all available years (no auth required) - NO CHANGES NEEDED
app.get('/public/years', async (req, res) => {
  try {
    // Get years from Year collection
    const yearDocs = await Year.find().sort({ year: -1 });
    const storedYears = yearDocs.map(doc => doc.year);
    
    // Default years
    const defaultYears = [2021, 2022, 2023, 2024, 2025];
    
    // Merge and deduplicate
    const combinedYears = [...new Set([...storedYears, ...defaultYears])].sort((a, b) => b - a);

    res.json(combinedYears);
  } catch (err) {
    console.error('Error fetching public years:', err);
    // Fallback to default years if error
    res.json([2025, 2024, 2023, 2022, 2021]);
  }
});

// Public route for exam dates (no auth required) - NO CHANGES NEEDED
app.get('/public/exam-dates/:year', async (req, res) => {
  try {
    const { year } = req.params;
    const yearNum = parseInt(year);
    
    // Get exam dates from ExamDate collection
    const storedDates = await ExamDate.find({ year: yearNum }).sort({ date: 1 });
    
    // Get hardcoded exam dates for the year
    const hardcodedDates = getHardcodedExamDates(yearNum);
    
    // Create a map to merge dates
    const dateMap = new Map();
    
    // Add hardcoded dates
    hardcodedDates.forEach(d => {
      dateMap.set(d.date, {
        date: d.date,
        label: d.label
      });
    });
    // Count how many questions already exist with the given serial number prefix
app.get('/questions/count/:prefix', requireAuth, async (req, res) => {
  const { prefix } = req.params;
  try {
    const regex = new RegExp(`^${prefix}`);
    const count = await MCQ.countDocuments({ questionNo: { $regex: regex } });
    res.json({ count });
  } catch (err) {
    console.error('Error counting questions:', err);
    res.status(500).json({ error: 'Error counting questions' });
  }
});

    
    // Add stored dates
    storedDates.forEach(d => {
      dateMap.set(d.date.toISOString().split('T')[0], {
        date: d.date.toISOString().split('T')[0],
        label: d.label
      });
    });
    
    // Convert map to array and sort
    const allDates = Array.from(dateMap.values())
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    
    res.json(allDates);
  } catch (err) {
    console.error('Error fetching exam dates:', err);
    res.status(500).json({ error: 'Error fetching exam dates' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.post('/api/classify', requireAuth, async (req, res) => {
  try {
    const response = await axios.post(
      `${CLASSIFIER_URL}/classify`,
      req.body,
      { timeout: 15000 }
    );
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Classification failed' });
  }
});
// Add this route to count questions with a base serial number
app.get('/questions/count/:baseSerial', requireAuth, async (req, res) => {
  try {
    const { baseSerial } = req.params;
    
    // Count questions that start with this base serial
    const count = await MCQ.countDocuments({
      questionNo: { $regex: `^${baseSerial}`, $options: 'i' }
    });
    
    res.json({ count });
  } catch (error) {
    console.error('Error counting questions:', error);
    res.status(500).json({ error: 'Failed to count questions' });
  }
});
// Import the new model at the top
const ApprovedMCQ = require('./approvedMcqModel');

// Middleware to check supreme user role
const requireSupremeUser = (req, res, next) => {
  if (req.session.userId && req.session.userRole === 'supremeuser') {
    next();
  } else {
    res.status(403).json({ error: 'Supreme user access required' });
  }
};

// Get pending questions for approval (supremeuser only)
app.get('/pending-questions', requireSupremeUser, async (req, res) => {
  try {
    const pendingQuestions = await MCQ.find({ approvalStatus: 'pending' })
      .populate('createdBy', 'username')
      .sort({ createdAt: -1 });
    
    res.json(pendingQuestions);
  } catch (error) {
    console.error('Error fetching pending questions:', error);
    res.status(500).json({ error: 'Error fetching pending questions' });
  }
});

// Approve a question (supremeuser only)
app.post('/approve-question/:id', requireSupremeUser, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find the question
    const question = await MCQ.findById(id);
    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }
    
    // Check if already approved
    if (question.approvalStatus === 'approved') {
      return res.status(400).json({ error: 'Question already approved' });
    }
    
    // Create approved question in secured database
    const approvedQuestion = new ApprovedMCQ({
      originalQuestionId: question._id,
      questionNo: question.questionNo,
      question: question.question,
      options: question.options,
      correctOption: question.correctOption,
      subject: question.subject,
      topic: question.topic,
      difficulty: question.difficulty,
      solution: question.solution,
      pyqType: question.pyqType,
      shift: question.shift,
      year: question.year,
      examDate: question.examDate,
      createdBy: question.createdBy,
      approvedBy: req.session.userId,
      autoClassified: question.autoClassified
    });
    
    await approvedQuestion.save();
    
    // Update original question status
    question.approvalStatus = 'approved';
    question.approvedBy = req.session.userId;
    question.approvedAt = new Date();
    await question.save();
    
    res.json({ 
      message: 'Question approved successfully',
      approvedQuestion: approvedQuestion
    });
  } catch (error) {
    console.error('Error approving question:', error);
    res.status(500).json({ error: 'Error approving question' });
  }
});

// Reject a question (supremeuser only)
app.post('/reject-question/:id', requireSupremeUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    const question = await MCQ.findById(id);
    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }
    
    question.approvalStatus = 'rejected';
    question.rejectionReason = reason || 'No reason provided';
    await question.save();
    
    res.json({ message: 'Question rejected successfully' });
  } catch (error) {
    console.error('Error rejecting question:', error);
    res.status(500).json({ error: 'Error rejecting question' });
  }
});

// Get approved questions (accessible to all authenticated users)
// Get approved questions (accessible to all authenticated users)
app.get('/approved-questions', requireAuth, async (req, res) => {
  try {
    let filter = {};
    
    if (req.session.userRole !== 'supremeuser') {
      filter.createdBy = req.session.userId;
    }
    
    const approvedQuestions = await ApprovedMCQ.find(filter)
      .populate('createdBy', 'username')
      .populate('approvedBy', 'username')
      .sort({ approvedAt: -1 });
    
    res.json(approvedQuestions);
  } catch (error) {
    console.error('Error fetching approved questions:', error);
    res.status(500).json({ error: 'Error fetching approved questions' });
  }
});
// Get approval statistics (supremeuser only)
app.get('/approval-stats', requireSupremeUser, async (req, res) => {
  try {
    const stats = await MCQ.aggregate([
      {
        $group: {
          _id: '$approvalStatus',
          count: { $sum: 1 }
        }
      }
    ]);
    
    const formattedStats = {
      pending: 0,
      approved: 0,
      rejected: 0
    };
    
    stats.forEach(stat => {
      if (stat._id) {
        formattedStats[stat._id] = stat.count;
      }
    });
    
    res.json(formattedStats);
  } catch (error) {
    console.error('Error fetching approval stats:', error);
    res.status(500).json({ error: 'Error fetching statistics' });
  }
});

// Bulk approve questions (supremeuser only)
app.post('/bulk-approve', requireSupremeUser, async (req, res) => {
  try {
    const { questionIds } = req.body;
    
    if (!Array.isArray(questionIds) || questionIds.length === 0) {
      return res.status(400).json({ error: 'No questions selected' });
    }
    
    let approvedCount = 0;
    
    for (const questionId of questionIds) {
      const question = await MCQ.findById(questionId);
      if (question && question.approvalStatus === 'pending') {
        // Create approved question
        const approvedQuestion = new ApprovedMCQ({
          originalQuestionId: question._id,
          questionNo: question.questionNo,
          question: question.question,
          options: question.options,
          correctOption: question.correctOption,
          subject: question.subject,
          topic: question.topic,
          difficulty: question.difficulty,
          solution: question.solution,
          pyqType: question.pyqType,
          shift: question.shift,
          year: question.year,
          examDate: question.examDate,
          createdBy: question.createdBy,
          approvedBy: req.session.userId,
          autoClassified: question.autoClassified
        });
        
        await approvedQuestion.save();
        
        // Update original question
        question.approvalStatus = 'approved';
        question.approvedBy = req.session.userId;
        question.approvedAt = new Date();
        await question.save();
        
        approvedCount++;
      }
    }
    
    res.json({ 
      message: `Successfully approved ${approvedCount} questions`,
      approvedCount 
    });
  } catch (error) {
    console.error('Error in bulk approval:', error);
    res.status(500).json({ error: 'Error in bulk approval' });
  }
});
// Get rejected questions (supremeuser only)
app.get('/rejected-questions', requireAuth, async (req, res) => {
  try {
    let filter = { approvalStatus: 'rejected' };
    
    if (req.session.userRole !== 'supremeuser') {
      filter.createdBy = req.session.userId;
    }
    
    const rejectedQuestions = await MCQ.find(filter)
      .populate('createdBy', 'username')
      .sort({ createdAt: -1 });
    
    res.json(rejectedQuestions);
  } catch (error) {
    console.error('Error fetching rejected questions:', error);
    res.status(500).json({ error: 'Error fetching rejected questions' });
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server started on port ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('📋 Features enabled:');
  console.log('✅ Question numbering system');
  console.log('✅ PYQ type classification');
  console.log('✅ JEE MAIN PYQ with shift and year');
  console.log('✅ Enhanced filtering and sorting');
  console.log('✅ Question statistics');
  console.log('✅ CRUD operations for questions');
  console.log('✅ Admin year and exam date management');
  console.log('✅ Auto-classification integration');
  console.log('✅ Solution field with LaTeX support'); // Add this line
  
  if (CLASSIFIER_URL) {
    console.log(`🤖 Classifier service URL: ${CLASSIFIER_URL}`);
  } else {
    console.log('⚠️  CLASSIFIER_URL not set - auto-classification disabled');
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received: closing HTTP server');
  app.close(() => {
    console.log('HTTP server closed');
    mongoose.connection.close(false, () => {
      console.log('MongoDB connection closed');
      process.exit(0);
    });
  });
});