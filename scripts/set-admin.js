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
        // Remove quotes if present
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

async function setUserAsAdmin(email) {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    const db = client.db(process.env.MONGODB_DB || 'interview_simulator');
    const usersCollection = db.collection('users');

    // Find the user
    const user = await usersCollection.findOne({ email });
    if (!user) {
      console.log(`❌ User with email ${email} not found`);
      process.exit(1);
    }

    // Update the user to be admin
    const result = await usersCollection.updateOne(
      { email },
      { $set: { isAdmin: true } }
    );

    if (result.modifiedCount > 0) {
      console.log(`✅ Successfully set ${email} as admin`);
      console.log(`User ID: ${user._id}`);
      console.log(`Name: ${user.name || 'N/A'}`);
      console.log(`Email: ${email}`);
      console.log(`isAdmin: true`);
    } else {
      console.log(`⚠️ User found but no update made (may already be admin)`);
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/set-admin.js <email>');
  process.exit(1);
}

setUserAsAdmin(email);
