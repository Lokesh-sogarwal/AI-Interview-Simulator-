# Contest Feature Documentation

## Overview
The Contest feature allows users to register for and participate in competitive interviews, track their performance, earn ratings, and compete on leaderboards.

## Features

### 1. Contest Discovery & Registration
- **Browse Available Contests**: View all available contests on the `/contests` page
- **Contest Details**: See contest description, dates, rules, and participant count
- **Easy Registration**: One-click registration for any available contest
- **Registration Validation**: Prevents duplicate registrations and enforces max participant limits

### 2. Contest Types
- **Upcoming Contests**: Not yet started, users can register in advance
- **Ongoing Contests**: Currently active, registered users can participate
- **Ended Contests**: Completed contests, leaderboard visible for reference

### 3. Contest Participation
- **Contest Mode Interview**: Take interviews within contest context
- **Score Submission**: Scores automatically recorded when interview completes
- **Real-time Leaderboard**: See current standings as other users complete contests

### 4. Rating System
- **Base Rating**: 1200 ELO-style rating for all users
- **Score Bonus**: +10 rating points per contest score point
- **Performance Bonus**: Additional bonus for top rankings
- **Dynamic Calculation**: Ratings update after each contest completion

### 5. Leaderboard & Statistics
- **Contest-specific Leaderboard**: Paginated leaderboard per contest
- **User Ratings Page**: Personal rating dashboard at `/ratings`
- **Global Ranking**: See your rank among all users
- **Rating Breakdown**: Visualize rating composition

## Pages & Routes

### User-Facing Pages
- **`/contests`** - Contest discovery and registration
- **`/contests/[id]`** - Contest details and leaderboard
- **`/ratings`** - Personal rating and statistics dashboard

### API Endpoints

#### Contest Management
- `GET /api/contests` - List all contests
- `POST /api/contests` - Create new contest (admin)

#### Contest Participation
- `POST /api/contests/[id]/register` - Register for contest
- `GET /api/contests/[id]/register` - Get contest details and registration status

#### Scoring & Ratings
- `POST /api/contests/[id]/score` - Submit final score for contest
- `GET /api/contests/[id]/leaderboard` - Get leaderboard with pagination

#### User Statistics
- `GET /api/users/stats` - Get current user's stats and rating

#### Admin
- `POST /api/admin/create-sample-contests` - Create sample contests (for testing)

## Database Schema

### contests Collection
```json
{
  "_id": ObjectId,
  "name": "string",
  "description": "string",
  "startDate": "Date",
  "endDate": "Date",
  "rules": "string",
  "maxParticipants": "number",
  "createdBy": "string",
  "createdAt": "Date",
  "status": "upcoming|ongoing|ended",
  "participantCount": "number"
}
```

### contest_registrations Collection
```json
{
  "_id": ObjectId,
  "userId": "string",
  "contestId": ObjectId,
  "registeredAt": "Date",
  "score": "number|null",
  "status": "registered|completed",
  "completedAt": "Date|null",
  "interviewId": "string|null"
}
```

### users Collection (Updated)
```json
{
  "id": "string",
  "email": "string",
  "rating": "number",          // Default: 1200
  "contestsCompleted": "number",
  "totalScore": "number"
}
```

## Rating Calculation

```
Rating = Base Rating (1200)
       + (Score × 10)
       + (Performance Bonus)

Performance Bonus:
- Rank 1: +50 points
- Rank 2: +45 points
- Rank 3: +40 points
- ...
- Top 10: progressively decreasing bonus
- Beyond Top 10: 0 bonus
```

## Usage Example

### User Registration Flow
1. User visits `/contests`
2. Views list of available contests
3. Clicks "Register" on a contest
4. System validates registration (not duplicate, not full)
5. User added to contest leaderboard
6. Contest details page shows registration status

### Contest Participation Flow
1. User visits contest detail page `/contests/[id]`
2. Clicks "Take Contest" button (if contest is active)
3. Redirected to interview setup with `?contest=id` parameter
4. Completes interview
5. System submits score to `/api/contests/[id]/score`
6. Rating calculated and updated
7. User's rank updated on leaderboard

### Rating Progression
1. User starts at 1200 rating
2. Completes first contest with 75/100 score
   - Score bonus: 75 × 10 = 750 points
   - Performance bonus (top 10): ~40 points
   - New rating: 1200 + 750 + 40 = 1990
3. With each contest, rating evolves based on performance

## Rating Tiers

| Rating Range | Tier | Description |
|---|---|---|
| 1000-1100 | Beginner | Starting level |
| 1100-1300 | Intermediate | Good interview skills |
| 1300-1500 | Expert | Strong performance |
| 1500+ | Master | Elite level |

## Features Integration

### With Existing Systems
- **Interview System**: Contest mode uses same interview engine
- **Gamification**: Contest wins contribute to points and badges
- **Performance Dashboard**: Contest stats visible in feedback page
- **Leaderboard**: Global leaderboard includes contest ratings

### Navigation
- **Sidebar**: "🏅 Contests" and "⭐ Ratings" links added
- **Contest Page**: Quick link to join contests
- **Ratings Page**: Links to available contests

## Sample Data

To create sample contests for testing, call:
```
POST /api/admin/create-sample-contests
```

This creates 3 sample contests:
1. Weekly Interview Challenge #1
2. Technical Interview Sprint
3. HR Communication Round

## Future Enhancements

1. **Contest Teams**: Support for team-based contests
2. **Prize System**: Virtual prizes for top performers
3. **Contest Predictions**: ML-based rating predictions
4. **Contest History**: Archive of past contests
5. **Rating Decay**: Gradual rating reduction for inactive users
6. **Custom Contests**: Users can create private contests
7. **Performance Analytics**: Advanced contest statistics
8. **Notifications**: Contest reminders and alerts

## Testing

### Manual Testing Steps
1. Visit `/contests` - see list of contests
2. Register for a contest
3. View contest details at `/contests/[id]`
4. Check leaderboard on contest detail page
5. Visit `/ratings` to see personal rating
6. Complete an interview to see rating changes

### API Testing
```bash
# Get contests
curl http://localhost:3000/api/contests

# Get contest details
curl http://localhost:3000/api/contests/[id]/register

# Get leaderboard
curl http://localhost:3000/api/contests/[id]/leaderboard

# Get user stats
curl http://localhost:3000/api/users/stats
```

## Performance Considerations

- **Leaderboard Pagination**: Uses skip/limit for large contests
- **Lazy Loading**: Leaderboard loads on demand
- **Index Optimization**: Indexes on contestId and userId recommended
- **Caching**: Consider caching leaderboards for frequently viewed contests

## Security

- ✅ Authentication required for all endpoints
- ✅ Users can only see their own stats
- ✅ Contest registration prevents duplicates
- ✅ Score submission only for registered users
- ✅ Admin endpoints should be restricted to admins only

## Troubleshooting

### Common Issues
1. **Registration fails**: Check if user already registered or contest is full
2. **Score not updated**: Verify interview completed successfully
3. **Rating calculation wrong**: Check if score is between 0-100
4. **Leaderboard empty**: Contest may not have participants yet

### Debug Commands
```bash
# Check contests in DB
db.contests.find()

# Check registrations
db.contest_registrations.find()

# Check user rating
db.users.findOne({id: "user_id"})
```
