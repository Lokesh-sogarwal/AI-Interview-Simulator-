const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

// Load .env.local manually
function loadEnv(filePath) {
  const envFile = fs.readFileSync(filePath, 'utf-8');
  const lines = envFile.split('\n');
  lines.forEach((line) => {
    if (line && !line.startsWith('#')) {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          process.env[key.trim()] = value.slice(1, -1);
        } else {
          process.env[key.trim()] = value;
        }
      }
    }
  });
}

loadEnv(path.join(__dirname, '..', '.env.local'));

async function createSampleTechnicalContests() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    const db = client.db(process.env.MONGODB_DB || 'interview_simulator');

    // Sample problems
    const problems = [
      {
        title: "Two Sum",
        description: "Given an array of integers nums and an integer target, return the indices of the two numbers that add up to target.",
        difficulty: "Easy",
        constraints: "2 <= nums.length <= 10^4",
        examples: [{ input: "[2,7,11,15], 9", output: "[0,1]" }],
        topics: ["Array", "Hash Table"]
      },
      {
        title: "Longest Substring Without Repeating Characters",
        description: "Find the length of the longest substring without repeating characters.",
        difficulty: "Medium",
        constraints: "0 <= s.length <= 5 * 10^4",
        examples: [{ input: '"abcabcbb"', output: "3" }],
        topics: ["String", "Sliding Window"]
      },
      {
        title: "Merge K Sorted Lists",
        description: "Merge all the linked-lists into one sorted linked-list.",
        difficulty: "Hard",
        constraints: "k == lists.length, 0 <= k <= 10^4",
        examples: [{ input: "[[1,4,5],[1,3,4],[2,6]]", output: "[1,1,2,1,3,4,4,5,6]" }],
        topics: ["Linked List", "Divide and Conquer"]
      }
    ];

    // Create a weekly contest template
    const nextSaturday = new Date();
    const daysUntilSaturday = (6 - nextSaturday.getDay() + 7) % 7;
    nextSaturday.setDate(nextSaturday.getDate() + (daysUntilSaturday === 0 ? 7 : daysUntilSaturday));
    nextSaturday.setHours(10, 0, 0, 0);

    const contestEnd = new Date(nextSaturday);
    contestEnd.setHours(12, 0, 0, 0);

    const result = await db.collection('contests').insertOne({
      name: "Weekly Coding Challenge",
      type: "coding",
      frequency: "weekly",
      description: "Test your coding skills with weekly challenges. Solve 3 problems of varying difficulty levels.",
      startDate: nextSaturday,
      endDate: contestEnd,
      duration: 2,
      rules: "Complete all coding problems. Score is based on correctness and efficiency.",
      maxParticipants: 1000,
      participantCount: 0,
      createdBy: "system",
      createdAt: new Date(),
      status: "upcoming",
      problems: problems,
      problemCount: problems.length,
      generatedAt: new Date(),
    });

    console.log('✅ Sample technical contest created successfully!\n');
    console.log(`📝 Contest Details:`);
    console.log(`   Name: Weekly Coding Challenge`);
    console.log(`   Type: 💻 Technical/Coding`);
    console.log(`   Frequency: Weekly (Saturdays)`);
    console.log(`   Problems: 3 (Easy, Medium, Hard)`);
    console.log(`   Start: ${nextSaturday.toLocaleString()}`);
    console.log(`   End: ${contestEnd.toLocaleString()}`);
    console.log(`   Contest ID: ${result.insertedId}\n`);

    console.log(`📊 Problems Included:`);
    problems.forEach((p, i) => {
      console.log(`   ${i + 1}. ${p.title} (${p.difficulty})`);
      console.log(`      Topics: ${p.topics.join(', ')}`);
    });

    console.log('\n✨ Users can now:');
    console.log('   1. Visit /contests');
    console.log('   2. See the "Weekly Coding Challenge"');
    console.log('   3. Register for the contest');
    console.log('   4. View problems when contest starts');
    console.log('   5. Compete and earn ratings\n');

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

createSampleTechnicalContests();
