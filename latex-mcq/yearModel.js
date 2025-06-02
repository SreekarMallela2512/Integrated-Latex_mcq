const mongoose = require('mongoose');

const yearSchema = new mongoose.Schema({
  year: {
    type: Number,
    required: true,
    unique: true,
    min: [1000, 'Year must be a 4-digit number']
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Year', yearSchema);