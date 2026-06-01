# Generate Daily Contest

## Option 1: Using the Admin API (Recommended)

Once your server is running on `http://localhost:3000`, make sure you're logged in as an admin user, then call:

```bash
curl -X POST http://localhost:3000/api/admin/generate-daily-contest \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Response:**
```json
{
  "ok": true,
  "message": "Contest created for today!",
  "contestId": "507f1f77bcf86cd799439011",
  "contest": {
    "name": "Daily Coding Challenge - 6/1/2026",
    "description": "Test your coding skills...",
    "startDate": "2026-06-01T...",
    "endDate": "2026-06-08T...",
    "problems": [
      {
        "title": "Two Sum",
        "description": "...",
        "difficulty": "Easy",
        "examples": [...]
      },
      ...
    ]
  }
}
```

## Option 2: Using MongoDB Directly

If you have direct MongoDB access:

```bash
# Connect to your MongoDB instance
mongosh

# Switch to your database
use interview_simulator

# Insert a contest document
db.contests.insertOne({
  "name": "Daily Coding Challenge - 6/1/2026",
  "description": "Test your coding skills with today's challenges",
  "startDate": new Date(),
  "endDate": new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  "rules": "Complete 3 coding problems in Python, JavaScript, C++, or Java",
  "maxParticipants": 500,
  "createdBy": "system",
  "createdAt": new Date(),
  "status": "active",
  "participantCount": 0,
  "type": "coding",
  "frequency": "daily",
  "problems": [
    {
      "title": "Two Sum",
      "description": "Given an array of integers...",
      "difficulty": "Easy",
      "constraints": "2 <= nums.length <= 10^4",
      "examples": [
        {
          "input": "[2,7,11,15], target=9",
          "output": "[0,1]"
        }
      ],
      "topics": ["array", "hash-map"]
    }
  ],
  "problemCount": 1
})
```

## Option 3: Via Admin Dashboard (Future)

Once implemented, navigate to `/admin/contests` and click "Generate Daily Contest".

---

## What Gets Created

✅ **Contest Details:**
- Name: "Daily Coding Challenge - [Today's Date]"
- Status: Active (starts immediately)
- Duration: 7 days
- Max participants: 500
- Type: Coding contest

✅ **Auto-Generated Problems:**
- 3 unique coding problems
- Varying difficulty (Easy, Medium, Hard)
- Generated via Hugging Face AI
- Each with test cases and examples

✅ **Features Enabled:**
- Users can register for the contest
- Code editor with multi-language support
- Real-time test execution
- Leaderboard rankings
- ELO rating updates

---

## Admin Requirements

The user making the API call must have:
- ✅ Valid authentication (logged in)
- ✅ `isAdmin` flag set to `true` in database

To verify your admin status:
```bash
# Check user in database
db.users.findOne({ email: "your-email@example.com" })
```

If `isAdmin` is missing or false, ask a database admin to update it:
```bash
db.users.updateOne(
  { email: "your-email@example.com" },
  { $set: { isAdmin: true } }
)
```

---

## Troubleshooting

**Error: "Only admins can generate contests"**
- ❌ Your user is not marked as admin
- ✅ Contact database admin to set `isAdmin: true`

**Error: "Unauthorized"**
- ❌ You're not logged in
- ✅ Log in first at `http://localhost:3000`

**Error: "Database not available"**
- ❌ MongoDB connection failed
- ✅ Check `.env.local` has valid `MONGODB_URI`

**No problems generated**
- ❌ Hugging Face API key missing
- ✅ Check `.env.local` has `HUGGINGFACE_API_KEY`

---

## What's Next?

Once the contest is created:

1. **Share Contest Link**: `/contests` page lists all active contests
2. **Users Register**: Click "Register" button on contest card
3. **Start Solving**: Once registered, click "Take Contest" or view problems
4. **Submit Solutions**: Users solve problems with the code editor
5. **View Results**: Leaderboard updates automatically

---

## API Endpoint Details

**POST** `/api/admin/generate-daily-contest`

**Headers:**
```
Content-Type: application/json
Cookie: (your auth cookie)
```

**Body:**
```json
{}
```

**Response (Success - 200):**
```json
{
  "ok": true,
  "message": "Contest created for today!",
  "contestId": "507f...",
  "contest": { ... }
}
```

**Response (Failure - 403):**
```json
{
  "ok": false,
  "error": "Only admins can generate contests"
}
```

**Response (Failure - 500):**
```json
{
  "ok": false,
  "error": "Failed to generate contest"
}
```

---

## Scheduling (Future Enhancement)

To automatically generate contests at a specific time daily:

```typescript
// Add to a scheduled job runner (e.g., node-cron)
import cron from 'node-cron';

// Every day at 9 AM
cron.schedule('0 9 * * *', async () => {
  await fetch('http://localhost:3000/api/admin/generate-daily-contest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}'
  });
  console.log('✅ Daily contest generated');
});
```

---

**Last Updated**: June 1, 2026
**Status**: ✅ Ready to use
