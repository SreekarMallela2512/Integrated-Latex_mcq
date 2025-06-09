require('dotenv').config();
const mongoose = require('mongoose');
const readline = require('readline');
const MCQ = require('../mcqModel');

async function moveApprovedToPending() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Connected to MongoDB');

    // Count approved questions
    const approvedCount = await MCQ.countDocuments({ approvalStatus: 'approved' });
    console.log(`\n📊 Total approved questions: ${approvedCount}`);

    if (approvedCount > 0) {
      // Show some sample approved questions
      const samples = await MCQ.find({ approvalStatus: 'approved' })
        .limit(5)
        .select('questionNo subject topic');
      
      console.log('\n📋 Sample approved questions:');
      samples.forEach(q => {
        console.log(`  - ${q.questionNo} | ${q.subject} | ${q.topic}`);
      });

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const confirm = await new Promise((resolve) => {
        rl.question(`\n⚠️  Do you want to move ALL ${approvedCount} approved questions back to pending? (yes/no): `, (answer) => {
          rl.close();
          resolve(answer.toLowerCase() === 'yes');
        });
      });

      if (confirm) {
        // Update all approved questions to pending
        const result = await MCQ.updateMany(
          { approvalStatus: 'approved' },
          {
            $set: {
              approvalStatus: 'pending',
              approvedBy: null,
              approvedAt: null
            }
          }
        );

        console.log(`\n✅ Moved ${result.modifiedCount} questions from approved to pending`);

        // Also delete from ApprovedMCQ collection if exists
        try {
          const ApprovedMCQ = require('../approvedMcqModel');
          const deleteResult = await ApprovedMCQ.deleteMany({});
          console.log(`✅ Removed ${deleteResult.deletedCount} entries from ApprovedMCQ collection`);
        } catch (err) {
          console.log('ℹ️  ApprovedMCQ collection not found or no entries to delete');
        }

        // Verify the change
        const newPendingCount = await MCQ.countDocuments({ approvalStatus: 'pending' });
        const newApprovedCount = await MCQ.countDocuments({ approvalStatus: 'approved' });
        
        console.log('\n📊 Updated counts:');
        console.log(`  - Pending: ${newPendingCount}`);
        console.log(`  - Approved: ${newApprovedCount}`);
      } else {
        console.log('\n❌ Operation cancelled');
      }
    } else {
      console.log('\n✅ No approved questions found');
    }

    await mongoose.connection.close();
    console.log('\n✅ Done');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

moveApprovedToPending();