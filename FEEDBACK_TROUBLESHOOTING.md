# Feedback Page - Troubleshooting Guide

## Issue: Feedback page not rendering or not redirecting

If you're experiencing issues with the feedback page, follow these debugging steps:

### Step 1: Check Browser Console (F12)

1. Open DevTools: Press `F12`
2. Go to **Console** tab
3. Look for any red error messages
4. Take note of any error messages and share them

### Step 2: Check Network Requests

1. Open DevTools: Press `F12`
2. Go to **Network** tab
3. Refresh the page (F5)
4. Look for API calls:
   - `/api/performance` - Should return 200 OK
   - `/api/interviews` - Should return 200 OK
5. Click on each request and check:
   - **Status**: Should be 200
   - **Response**: Should show JSON data

### Step 3: Verify Authentication

The feedback page requires authentication. Check:

1. Are you logged in?
2. Open DevTools → **Application** → **Cookies**
3. Look for a `token` cookie
4. If no token, you should be redirected to `/auth/login`

---

## Common Issues & Solutions

### Issue: Infinite redirect loop

**Symptom**: Page keeps redirecting to login, even when logged in

**Solution**:
1. Check if token is valid
2. Clear cookies: DevTools → Application → Cookies → Delete all
3. Log out and log back in
4. Try accessing `/feedback` again

### Issue: API returns 401 Unauthorized

**Symptom**: Console shows "Not authenticated" error

**Solution**:
1. Make sure you're logged in
2. Check if your session expired
3. Try logging out and back in

### Issue: API returns 503 Database Error

**Symptom**: Console shows "Database not configured" error

**Solution**:
1. Check if MongoDB connection string is set in `.env.local`
2. Verify database is running
3. Restart the dev server: `npm run dev`

### Issue: Page shows 0.0% with all metrics zero

**Symptom**: Overall Performance shows 0.0%, all scores are 0

**Causes**:
- User hasn't completed any interviews yet (expected)
- User data might not be in database

**Solution**:
1. Complete an interview first
2. Go to `/interview` to do a practice interview
3. Come back to `/feedback` to see scores

### Issue: Global Performance Metrics section not showing

**Symptom**: "Overall Performance" section shows but "Global Performance Metrics" section missing

**Solution**:
1. Hard refresh the page: `Ctrl+Shift+R` (or `Cmd+Shift+R` on Mac)
2. Clear browser cache
3. Check console for JavaScript errors

---

## What the Page Should Show

### When no interviews completed:
```
Your feedback
Summary scores and key improvements from this session.

Overall Performance
├── Overall Performance: 0.0% (red background)
├── Technical Skills: 0.0
├── Clarity: 0.0
├── Confidence: 0.0
├── Depth: 0.0
├── Best Score: 0.0%
├── Average Score: 0.0%
├── Worst Score: 0.0%
└── Global Performance Metrics
    ├── Overall Score: 0 /100
    ├── Performance Tier: Intermediate (ELO 1200)
    ├── Interview Score: 0 (0 interviews)
    ├── Contest Score: 0 (0 contests)
    ├── Consistency: 0
    ├── Ranking Composition breakdown
    └── Activity Summary
```

### When interviews are completed:
```
Your feedback

Overall Performance
├── Overall Performance: 75.3% (green background)
├── Technical Skills: 75
├── Clarity: 80
├── Confidence: 70
├── Depth: 78
├── Best Score: 85.0%
├── Average Score: 75.3%
├── Worst Score: 65.0%
├── Performance Trend (bar chart of last 10)
└── Global Performance Metrics
    ├── Overall Score: 78 /100
    ├── Performance Tier: Advanced (ELO 1350)
    ├── Interview Score: 75 (12 interviews)
    ├── Contest Score: 68 (3 contests)
    ├── Consistency: 82
    ├── Ranking Composition (shows contribution of each metric)
    └── Activity Summary (shows participation stats)
```

---

## API Endpoints Being Called

### 1. GET /api/interviews
- Fetches all interviews for current user
- Used by FeedbackClient to load session transcript
- **Expected Response**:
  ```json
  {
    "ok": true,
    "interviews": [
      {
        "id": "...",
        "transcript": [...],
        "totalScore": 75,
        "createdAt": "2024-01-01T12:00:00Z"
      }
    ]
  }
  ```

### 2. GET /api/performance
- Fetches comprehensive performance data
- Combines interview history + global metrics
- **Expected Response**:
  ```json
  {
    "ok": true,
    "overallPerformance": 78,
    "averageScore": 75,
    "bestScore": 85,
    "worstScore": 65,
    "totalInterviews": 12,
    "stats": {
      "technical": 75,
      "clarity": 80,
      "confidence": 70,
      "depth": 78
    },
    "trend": [...],
    "insights": {...},
    "dynamicMetrics": {
      "overallScore": 78,
      "interviewScore": 75,
      "interviewCount": 12,
      "contestScore": 68,
      "contestCount": 3,
      "contestWins": 1,
      "eloRating": 1350,
      "performance": "Advanced",
      "consistency": 82,
      "recentActivity": 2
    }
  }
  ```

---

## Debugging Checklist

- [ ] Can you access `/` (home page)?
- [ ] Can you access `/auth/login`?
- [ ] Are you logged in?
- [ ] Does `/interview` work?
- [ ] Check browser console for errors
- [ ] Check Network tab - do API calls succeed?
- [ ] Try hard refresh: `Ctrl+Shift+R`
- [ ] Clear cookies and login again
- [ ] Check if token is valid

---

## Error Codes Reference

| Status | Meaning | Solution |
|--------|---------|----------|
| 200 | Success | All good! |
| 401 | Not authenticated | Login required |
| 403 | Forbidden | Permission denied |
| 404 | Not found | API endpoint doesn't exist |
| 500 | Server error | Check server logs |
| 503 | Database error | Check MongoDB connection |

---

## Still Having Issues?

If you're still experiencing problems:

1. **Check the server logs**: Look at terminal where dev server is running
2. **Restart the server**: `npm run dev`
3. **Clear everything**:
   ```bash
   # Clear cache
   rm -rf .next
   # Reinstall
   npm install
   # Restart
   npm run dev
   ```
4. **Check MongoDB**: Verify database is running and connected

---

## Recent Changes

The feedback page was recently enhanced with new "Global Performance Metrics" that include:
- Overall score combining interviews, contests, ELO, consistency, and activity
- Performance tier classification
- Detailed ranking composition
- Activity summary

These changes may have introduced rendering issues if:
- API returns error while calculating metrics
- Component not handling missing data gracefully
- Type mismatches in response data

**All error handling has been added to gracefully handle these cases.**

---

## Testing the Fix

After making changes, test with:

```bash
# 1. Start dev server
npm run dev

# 2. Go to http://localhost:3000/feedback

# 3. Open browser console (F12)

# 4. You should see:
# - No red errors in console
# - Page loads (not blank/hanging)
# - Performance metrics displayed
# - "Loading performance data..." while fetching

# 5. Test with no interviews
# - Should show 0.0% performance
# - All metrics should be 0
# - Global metrics section should still show

# 6. Complete an interview, then test again
# - Scores should update
# - Global metrics should show real data
```
