const mongoose = require('mongoose');

const mcqSchema = new mongoose.Schema({
  questionNo: {
    type: String,
    required: true,
    trim: true,
    unique: true //
  },
  question: String,
  options: [String],
  correctOption: Number,
  subject: String,
  topic: String,
  difficulty: String,
  solution: {  // Add this new field
    type: String,
    default: ''
  },
  pyqType: {
    type: String,
    enum: ['JEE MAIN PYQ', 'Not PYQ'],
    default: 'Not PYQ'
  },
  shift: {
    type: String,
    enum: ['Shift 1', 'Shift 2', 'N/A'],
    default: 'N/A'
  },
  year: {
    type: Number,
  },
  examDate: {
    type: Date,
    required : false
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  autoClassified: {
    type: Boolean,
    default: false
  },
  // Add these fields to your existing mcqSchema
approvalStatus: {
  type: String,
  enum: ['pending', 'approved', 'rejected'],
  default: 'pending'
},
approvedBy: {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'User'
},
approvedAt: {
  type: Date
},
rejectionReason: {
  type: String
},
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('MCQ', mcqSchema);