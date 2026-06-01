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

async function listUsers() {
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

    // List all users
    const users = await usersCollection.find({}).limit(10).toArray();
    
    if (users.length === 0) {
      console.log('No users found in database');
    } else {
      console.log(`Found ${users.length} users:\n`);
      users.forEach((user, index) => {
        console.log(`${index + 1}. Email: ${user.email || 'N/A'}`);
        console.log(`   Name: ${user.name || 'N/A'}`);
        console.log(`   ID: ${user._id || user.id || 'N/A'}`);
        console.log(`   Admin: ${user.isAdmin ? 'Yes ✅' : 'No ❌'}`);
        console.log('');
      });
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

listUsers();
