require('dotenv').config();
const mongoose = require('mongoose');
const readline = require('readline');
const MCQ = require('../mcqModel');

async function fixApprovalStatus() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Connected to MongoDB');

    // First, let's see what we're dealing with
    const totalQuestions = await MCQ.countDocuments();
    console.log(`\n📊 Total questions: ${totalQuestions}`);

    // Count questions that need fixing
    const needsFixing = await MCQ.countDocuments({
      $or: [
        { approvalStatus: { $exists: false } },
        { approvalStatus: null },
        { approvalStatus: '' },
        { approvalStatus: { $nin: ['pending', 'approved', 'rejected'] } }
      ]
    });

    console.log(`\n🔧 Questions that need fixing: ${needsFixing}`);

    if (needsFixing > 0) {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const confirm = await new Promise((resolve) => {
        rl.question(`\nDo you want to set ${needsFixing} questions to 'pending' status? (yes/no): `, (answer) => {
          rl.close();
          resolve(answer.toLowerCase() === 'yes');
        });
      });

      if (confirm) {
        // Update all questions without proper status to 'pending'
        const result = await MCQ.updateMany(
          {
            $or: [
              { approvalStatus: { $exists: false } },
              { approvalStatus: null },
              { approvalStatus: '' },
              { approvalStatus: { $nin: ['pending', 'approved', 'rejected'] } }
            ]
          },
          {
            $set: {
              approvalStatus: 'pending',
              approvedBy: null,
              approvedAt: null,
              rejectionReason: null
            }
          }
        );

        console.log(`\n✅ Updated ${result.modifiedCount} questions to 'pending' status`);

        // Verify the fix
        const afterPending = await MCQ.countDocuments({ approvalStatus: 'pending' });
        console.log(`\n📊 Total pending questions now: ${afterPending}`);
      } else {
        console.log('\n❌ Operation cancelled');
      }
    } else {
      console.log('\n✅ All questions already have proper approval status');
    }

    await mongoose.connection.close();
    console.log('\n✅ Done');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixApprovalStatus();