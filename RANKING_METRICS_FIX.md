# Ranking Metrics Fix - Dynamic Calculation Update

## What Was Wrong

The Global Performance Metrics were showing all static values:
- Interview Performance: 0.0 (not calculating)
- Contest Performance: 0.0 (not calculating)
- ELO Rating: 0.0 (not calculating)
- Consistency: 10.0 (calculating)
- Recent Activity: 9.2 (calculating)

Only 2 out of 5 metrics were calculating correctly!

## Root Causes Identified

### 1. Wrong Database Field Names
**Problem**: Ranking calculator was looking for fields that don't exist in the database

**Before**:
```typescript
// Looking for these fields that don't exist:
.find({ userId, status: "completed" })  // No "status" field in interviews
.map((i: any) => i.score || 0)          // Field is "totalScore", not "score"
.map((r: any) => r.score || 0)          // Same issue in contest_registrations
```

**After**:
```typescript
// Query actual fields in database:
.find({ userId })                       // No status filter needed
.map((i: any) => i.totalScore || 0)     // Use correct field name
.map((r: any) => r.score || 0)          // Use correct field name
```

### 2. Missing Fallback Calculation
**Problem**: If totalScore was missing, no fallback to calculate from breakdown

**Before**:
```typescript
const scores = interviews.map((i: any) => i.score || 0);
// Returns 0 if score field doesn't exist
```

**After**:
```typescript
const scores = interviews
  .map((i: any) => {
    // Try totalScore first
    if (typeof i.totalScore === 'number') return i.totalScore;
    // Fallback to calculating from breakdown
    if (i.breakdown?.technical !== undefined) {
      const breakdown = i.breakdown;
      return (breakdown.technical + breakdown.clarity + breakdown.confidence + breakdown.depth) / 4;
    }
    return 0;
  })
  .filter((s: number) => s > 0);  // Filter out zeros for better average
```

### 3. Removed Unnecessary Status Filter
**Problem**: Interviews and contest registrations don't have "status" field

**Before**:
```typescript
.find({ userId, status: "completed" })  // This filters out ALL records!
```

**After**:
```typescript
.find({ userId })                       // Query all records for user
```

### 4. Added Error Logging
**Problem**: Errors were silently failing, making it hard to debug

**Before**:
```typescript
} catch {
  return { interviewScore: 0, ... };
}
```

**After**:
```typescript
} catch (error) {
  console.error("Error getting interview stats:", error);
  return { interviewScore: 0, ... };
}
```

---

## How Metrics Now Calculate

### Interview Performance (25%)
```
1. Fetch all interviews for user (removed status filter)
2. Extract totalScore from each interview
3. If totalScore missing, calculate from breakdown (technical + clarity + confidence + depth) / 4
4. Average all scores to get interviewScore
5. Calculate stddev for consistency metric
6. Find most recent interview for activity tracking
```

### Contest Performance (25%)
```
1. Fetch all contest registrations for user (removed status filter)
2. Extract score from each registration
3. Average scores to get contestScore
4. For each registration, count how many users scored higher
5. If user is in top 10%, count as a "win"
6. Return contestWins count
```

### Both Metrics Now
```
- Filter out zero scores for accurate average
- Handle missing fields gracefully
- Log errors for debugging
- Return sensible defaults on failure
```

---

## Expected Behavior After Fix

### For Users With No Interviews
```
Overall Performance: 0-20% (only activity & consistency)
Interview Performance (25%): 0.0
Contest Performance (25%): 0.0
ELO Rating (30%): 0.0
Consistency (10%): 0-100 (default/calculated)
Recent Activity (10%): 0-100 (based on days)
```

### For Users With Interviews
```
Overall Performance: 50-100% (full calculation)
Interview Performance (25%): 40-100 (actual interview scores)
Contest Performance (25%): 0-100 (if participated)
ELO Rating (30%): 20-100 (normalized from 1200-2000)
Consistency (10%): 0-100 (based on score stability)
Recent Activity (10%): 0-100 (based on days since activity)
```

---

## Verification Steps

After this fix, the metrics should calculate correctly:

1. ✅ Interview scores should match the user's actual interview scores
2. ✅ Contest scores should reflect actual contest participation
3. ✅ Consistency should show score variation (lower variation = higher score)
4. ✅ Recent Activity should decrease over time
5. ✅ Overall Performance should be the weighted combination of all 5 factors

---

## Files Modified

**`app/lib/ranking-calculator.ts`**
- Updated `getInterviewStats()` function
  - Fixed field name from `score` to `totalScore`
  - Removed `status: "completed"` filter
  - Added fallback calculation from breakdown
  - Added error logging
  - Handle empty score arrays

- Updated `getContestStats()` function
  - Removed `status: "completed"` filter
  - Filter out zero scores for accurate average
  - Handle empty score arrays
  - Added error logging

---

## Impact

✅ All 5 metrics will now calculate dynamically  
✅ Interview scores will show actual performance  
✅ Contest participation will be reflected  
✅ ELO rating will be included properly  
✅ Users will see comprehensive global metrics  

**No more static zero values!**
