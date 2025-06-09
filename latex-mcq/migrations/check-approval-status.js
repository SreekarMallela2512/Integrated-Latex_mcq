require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');

// Import the MCQ model from parent directory
const MCQ = require('../mcqModel');

async function checkApprovalStatus() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Connected to MongoDB');

    // Get total count
    const totalQuestions = await MCQ.countDocuments();
    console.log(`\n📊 Total questions in database: ${totalQuestions}`);

    // Count by approval status
    const pendingCount = await MCQ.countDocuments({ approvalStatus: 'pending' });
    const approvedCount = await MCQ.countDocuments({ approvalStatus: 'approved' });
    const rejectedCount = await MCQ.countDocuments({ approvalStatus: 'rejected' });
    const noStatusCount = await MCQ.countDocuments({ 
      $or: [
        { approvalStatus: { $exists: false } },
        { approvalStatus: null },
        { approvalStatus: '' }
      ]
    });

    console.log('\n📈 Breakdown by approval status:');
    console.log(`  - Pending: ${pendingCount}`);
    console.log(`  - Approved: ${approvedCount}`);
    console.log(`  - Rejected: ${rejectedCount}`);
    console.log(`  - No status/null: ${noStatusCount}`);

    // Check for other values
    const otherStatuses = await MCQ.distinct('approvalStatus');
    console.log('\n🔍 All unique approval status values:', otherStatuses);

    // Sample some questions without status
    if (noStatusCount > 0) {
      const samplesWithoutStatus = await MCQ.find({
        $or: [
          { approvalStatus: { $exists: false } },
          { approvalStatus: null },
          { approvalStatus: '' }
        ]
      }).limit(5).select('_id questionNo approvalStatus');
      
      console.log('\n📋 Sample questions without proper status:');
      samplesWithoutStatus.forEach(q => {
        console.log(`  - ID: ${q._id}, QuestionNo: ${q.questionNo}, Status: ${q.approvalStatus}`);
      });
    }

    await mongoose.connection.close();
    console.log('\n✅ Check complete');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkApprovalStatus();