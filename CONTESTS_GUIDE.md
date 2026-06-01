# 🏅 Contest Feature Guide

## What's New?

Your AI Interview Simulator now includes a comprehensive **Contest System** where users can:
- 🎯 **Register** for competitive contests
- 🏆 **Participate** in interview challenges
- 📊 **Track Ratings** and climb leaderboards
- ⭐ **Compete Globally** against other users

## Getting Started

### 1. Visit the Contests Page
Navigate to **Contests** from the sidebar (🏅 icon) or visit `/contests`

### 2. Browse Available Contests
You'll see:
- Contest name and description
- Start and end dates
- Number of participants
- Contest status (Upcoming, Ongoing, Ended)
- Registration button

### 3. Register for a Contest
Click **Register** to join any open contest. You can register for multiple contests.

### 4. Take the Contest
When a contest is active:
1. Visit the contest details page
2. Click **"Take Contest"** button
3. Complete the interview questions
4. Your score is automatically submitted

### 5. Check Your Rating
Visit **Ratings** (⭐ icon) to see:
- Your current rating
- Contests completed
- Global ranking
- Rating breakdown

## How Ratings Work

### Rating System
Users start with a **base rating of 1200** (ELO-style rating system)

### Rating Increases Based On:
1. **Score Bonus**: +10 rating points per point of interview score
   - Example: 75/100 score = +750 rating points
   
2. **Performance Bonus**: Bonus for top rankings
   - Rank #1: +50 bonus
   - Rank #2: +45 bonus
   - Top 10: Progressively decreasing bonus

### Example Calculation
```
Base Rating:           1200
Score (75/100):        + 750 (75 × 10)
Performance (Rank 3):  + 40
─────────────────────────
Total Rating:          1990
```

## Rating Tiers

| Rating | Tier | Description |
|--------|------|-------------|
| 1000-1100 | 🟦 Beginner | Starting level |
| 1100-1300 | 🟩 Intermediate | Good skills developing |
| 1300-1500 | 🟨 Expert | Strong performance |
| 1500+ | 🟥 Master | Elite level |

## Contest Types

### Upcoming Contests
- Not yet started
- Click to see details
- Register in advance
- Prepare with practice interviews

### Ongoing Contests
- Currently active
- Registered users can participate
- Real-time leaderboard updates
- Best scores count

### Ended Contests
- Contest finished
- Leaderboard preserved
- View your final ranking
- See performance history

## Leaderboard

Each contest has a **paginated leaderboard** showing:
- 🥇 Rank of each participant
- 👤 Username
- 📊 Score
- ⭐ Rating earned
- ✅ Completion status

### Features:
- Top performers highlighted
- Real-time updates
- Pagination (10 per page)
- Sort by score and rating

## Personal Stats Dashboard

### Your Ratings Page (`/ratings`)
Shows comprehensive statistics:
- **Current Rating** - Your ELO-style rating
- **Contests Completed** - Total contests finished
- **Global Rank** - Position among all users
- **Average Score** - Per-contest performance

### Rating Breakdown
Visual breakdown showing:
- Base rating contribution
- Score bonus contribution
- Ranking bonus contribution

## Navigation

### Quick Links in Sidebar
- 🏅 **Contests** - Browse and register for contests
- ⭐ **Ratings** - View your rating and statistics
- 🏆 **Leaderboard** - Global leaderboard
- 📊 **History** - Your interview history

## Tips for Success

### 1. Choose Contests by Level
- Start with **Beginner** contests
- Progress to **Technical** and **HR** contests
- Challenge yourself with **Mixed** contests

### 2. Preparation
- Use **Interview** mode to practice
- Review your **History** and **Feedback**
- Study weak areas before contests

### 3. Timing
- Check contest **start times**
- Plan to participate when you're focused
- Don't rush through questions

### 4. Competition
- Compare your score with **leaderboard**
- Track your **rating progression**
- Try to rank in **top 10** for bonus points

## API Reference

### List Contests
```
GET /api/contests
Response: { ok: true, contests: [...] }
```

### Register for Contest
```
POST /api/contests/[id]/register
Response: { ok: true, registrationId: "..." }
```

### Get Contest Leaderboard
```
GET /api/contests/[id]/leaderboard?page=1
Response: { ok: true, leaderboard: [...], totalPages: 5 }
```

### Get Your Stats
```
GET /api/users/stats
Response: { ok: true, stats: { rating: 1500, contestsCompleted: 5, ... } }
```

### Submit Contest Score
```
POST /api/contests/[id]/score
Body: { score: 85, interviewId: "..." }
Response: { ok: true, rating: 2000, rank: 3 }
```

## Features

✅ **Contest Management**
- Browse all contests
- Register with one click
- See participant counts
- Check contest rules

✅ **Real-time Updates**
- Live leaderboard updates
- Score submission tracking
- Rating calculations

✅ **User Ratings**
- ELO-style rating system
- Performance-based calculation
- Global ranking
- Rating tiers

✅ **Leaderboards**
- Contest-specific leaderboards
- Global user leaderboard
- Paginated results
- Real-time updates

✅ **Statistics**
- Personal rating dashboard
- Contest history
- Performance metrics
- Ranking progression

## FAQ

**Q: Can I participate in multiple contests?**
A: Yes! You can register for as many contests as you want.

**Q: How often does my rating update?**
A: Your rating updates immediately after you complete a contest.

**Q: What if I don't complete a contest?**
A: You'll remain registered but your score won't be recorded. Your rating won't change.

**Q: Can I change my contest score?**
A: No, scores are final once submitted. Your rating is locked at that score.

**Q: How do I improve my rating?**
A: Participate in contests and score as high as possible. Better scores = higher ratings.

**Q: What's the difference between Contest and Practice?**
A: Contests are competitive - your score affects your rating and leaderboard ranking. Practice is non-competitive for learning.

## Sample Contests

On first setup, three sample contests are available:
1. **Weekly Interview Challenge #1** - General interview questions
2. **Technical Interview Sprint** - Advanced technical questions
3. **HR Communication Round** - HR and behavioral questions

## Contact & Support

For issues or feature requests, please reach out through the app's feedback system.

---

**Happy competing! 🚀 Good luck climbing the leaderboard!** 🏆
