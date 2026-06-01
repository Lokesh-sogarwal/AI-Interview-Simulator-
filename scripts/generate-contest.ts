/**
 * Generate a contest for today
 * 
 * Run this script with:
 * npx ts-node scripts/generate-contest.ts
 */

import { getDb } from '../lib/mongodb';
import { generateContestProblems } from '../app/lib/problem-generator';

async function generateDailyContest() {
  try {
    const db = await getDb();
    if (!db) {
      console.error('Database not available');
      process.exit(1);
    }

    console.log('🚀 Generating contest for today...\n');

    const today = new Date();
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 7);

    // Generate problems
    console.log('📝 Generating 3 coding problems...');
    const { problems, generatedAt } = await generateContestProblems(
      "Today's Coding Challenge",
      3
    );

    console.log(`✅ Generated ${problems.length} problems\n`);

    // Create contest
    const contest = {
      name: `Daily Coding Challenge - ${today.toLocaleDateString()}`,
      description:
        'Test your coding skills with today\'s challenges. Solve problems in your favorite language!',
      startDate: today,
      endDate: endDate,
      rules:
        '• Complete 3 coding problems\n• Use Python, JavaScript, C++, or Java\n• Score based on correctness and efficiency\n• Submit when all test cases pass',
      maxParticipants: 500,
      createdBy: 'system',
      createdAt: new Date(),
      status: 'active',
      participantCount: 0,
      type: 'coding',
      frequency: 'daily',
      problems: problems,
      problemCount: problems.length,
      generatedAt: generatedAt,
    };

    const result = await db.collection('contests').insertOne(contest as any);

    console.log('📋 Contest Details:');
    console.log(`  Name: ${contest.name}`);
    console.log(`  Start: ${today.toLocaleString()}`);
    console.log(`  End: ${endDate.toLocaleString()}`);
    console.log(`  Problems: ${contest.problemCount}`);
    console.log(`  Contest ID: ${result.insertedId}\n`);

    console.log('🎉 Contest created successfully!\n');

    console.log('Problems:');
    problems.forEach((p, idx) => {
      console.log(`  ${idx + 1}. ${p.title} (${p.difficulty})`);
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Error generating contest:', error);
    process.exit(1);
  }
}

generateDailyContest();
