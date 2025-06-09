// migration-add-approval-fields.js
const mongoose = require('mongoose');
const MCQ = require('./mcqModel');
require('dotenv').config();

async function migrate() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // Update all existing questions to have 'pending' approval status
    const result = await MCQ.updateMany(
      { approvalStatus: { $exists: false } },
      { 
        $set: { 
          approvalStatus: 'pending',
          approvedBy: null,
          approvedAt: null,
          rejectionReason: null
        } 
      }
    );
    
    console.log(`Updated ${result.modifiedCount} questions`);
    
    await mongoose.connection.close();
    console.log('Migration completed');
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
}

migrate();