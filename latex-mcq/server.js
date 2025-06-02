require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');

const MCQ = require('./mcqModel');
const User = require('./userModel');
const Year = require('./yearModel');
const ExamDate = require('./examDateModel');  
const app = express();

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('✅ Connected to MongoDB Atlas');
}).catch(err => {
  console.error('❌ Connection error:', err.message);
});

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-this',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI
  }),
  cookie: {
    secure: false, // Set to true in production with HTTPS
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

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
    const { username, password } = req.body;
    
    const user = await User.findOne({
      $or: [{ username }, { email: username }]
    });
    
    if (!user || !(await user.comparePassword(password))) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    
    req.session.userId = user._id;
    req.session.username = user.username;
    req.session.userRole = user.role;
    
    res.json({
      message: 'Login successful',
      user: {
        id: user._id,
        username: user.username,
        role: user.role
      }
    });
  } catch (error) {
    console.error(error);
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

// MCQ submission route
app.post('/submit', requireAuth, async (req, res) => {
  try {
    const { 
      questionNo, 
      question, 
      options, 
      correctOption, 
      subject, 
      topic, 
      difficulty, 
      pyqType, 
      shift, 
      year,
      examDate
    } = req.body;

    // Validate PYQ fields if needed
    if (pyqType === 'JEE MAIN PYQ') {
      if (!shift || !year) {
        return res.status(400).json({ 
          error: 'Shift and Year are required for JEE MAIN PYQ questions' 
        });
      }
      const yearNum = parseInt(year);
  if (yearNum < 1000) {
    return res.status(400).json({ 
      error: 'Invalid year. Year must be a 4-digit number (minimum 1000).' 
    });
  }
}
    
      

    const correctOptionIndex = parseInt(correctOption, 10) - 1;

    // Create MCQ object with conditional fields
    const mcqData = {
      questionNo: questionNo,
      question,
      options,
      correctOption: correctOptionIndex,
      subject,
      topic,
      difficulty,
      pyqType: pyqType || 'Not PYQ',
      createdBy: req.session.userId
    };

    // Add PYQ specific fields if applicable
    if (pyqType === 'JEE MAIN PYQ') {
      mcqData.shift = shift;
      mcqData.year = parseInt(year);
      if (examDate) {
        mcqData.examDate = new Date(examDate);
      }
    }

    const mcq = new MCQ(mcqData);
    await mcq.save();
    
    res.json({ 
      message: "Question added successfully!",
      questionId: mcq._id 
    });
  } catch (err) {
    console.error('Error saving question:', err);
    res.status(500).json({ error: "Error saving question. Please try again." });
  }
});

// Get questions based on user role with enhanced filtering and sorting
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
    }
    
    // Ensure createdAt is included in response
    questions = questions.map(q => ({
      ...q,
      createdAt: q.createdAt || q._id.getTimestamp() // Fallback to ObjectId timestamp if createdAt is missing
    }));
    
    res.json(questions);
  } catch (err) {
    console.error('Error fetching questions:', err);
    res.status(500).json({ error: "Error fetching questions." });
  }
});

// Get single question by ID (for editing)
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
    
    res.json(question);
  } catch (err) {
    console.error('Error fetching question:', err);
    res.status(500).json({ error: 'Error fetching question' });
  }
});

// Update question (only own questions for regular users)
app.put('/questions/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    // Convert correctOption to 0-based index if it's 1-based
    if (updateData.correctOption && typeof updateData.correctOption === 'string') {
      updateData.correctOption = parseInt(updateData.correctOption) - 1;
    }
    
    let filter = { _id: id };
    
    // Regular users can only update their own questions
    if (req.session.userRole !== 'superuser') {
      filter.createdBy = req.session.userId;
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

// Delete question (only own questions for regular users)
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

// Get question statistics
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

    res.json(stats[0] || { totalQuestions: 0, subjects: {}, pyqTypes: {}, difficulties: {} });
  } catch (err) {
    console.error('Error fetching stats:', err);
    res.status(500).json({ error: "Error fetching statistics." });
  }
});

// Super user only route to get all users
app.get('/users', requireSuperUser, async (req, res) => {
  try {
    const users = await User.find().select('-password');
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error fetching users' });
  }
});

// Get unique years from database for filtering
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

// Helper function to get hardcoded exam dates
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
      { date: '2024-01-24', label: 'January 24, 2024' },
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

// Year Management Routes (Superuser only)
// Year Management Routes (Superuser only)
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

// Public route: Get all available years for the frontend dropdown
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

// Exam Date Management Routes (Superuser only)
// Exam Date Management Routes (Superuser only)
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

// Also update the public route used by the main form
app.get('/admin/exam-dates/:year', async (req, res) => {
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
// Public route: Get all available years (no auth required)
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

// Public route for exam dates (no auth required)
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
  console.log('Features added:');
  console.log('✅ Question numbering system (no uniqueness constraint)');
  console.log('✅ PYQ type classification');
  console.log('✅ JEE MAIN PYQ with shift and year');
  console.log('✅ Enhanced filtering and sorting');
  console.log('✅ Question statistics');
  console.log('✅ CRUD operations for questions');
  console.log('✅ Admin year and exam date management');
});