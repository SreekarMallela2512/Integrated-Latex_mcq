const mongoose = require('mongoose');

const approvedMcqSchema = new mongoose.Schema({
  // Reference to original question
  originalQuestionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MCQ',
    required: true
  },
  
  // All question fields
  questionNo: { type: String, required: true },
  question: { type: String, required: true },
  options: [{ type: String, required: true }],
  correctOption: { type: Number, required: true, min: 0, max: 3 },
  subject: { type: String, required: true },
  topic: { type: String, required: true },
  difficulty: { type: String, required: true },
  solution: { type: String, default: '' },
  
  // PYQ fields
  pyqType: { type: String, default: 'Not PYQ' },
  shift: { type: String },
  year: { type: Number },
  examDate: { type: Date },
  
  // Metadata
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  approvedAt: { type: Date, default: Date.now },
  autoClassified: { type: Boolean, default: false }
}, {
  timestamps: true
});

module.exports = mongoose.model('ApprovedMCQ', approvedMcqSchema);