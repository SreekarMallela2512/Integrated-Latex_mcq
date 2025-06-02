const mongoose = require('mongoose');

const examDateSchema = new mongoose.Schema({
  year: {
    type: Number,
    required: true,
    min: [1000,'Year Must be a 4-digit number']
  },
  date: {
    type: Date,
    required: true
  },
  label: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Compound index to ensure unique date per year
examDateSchema.index({ year: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('ExamDate', examDateSchema);