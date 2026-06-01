# Admin-Only Contest Creation

## Overview

The contest creation feature is now restricted to **admin users only**. This ensures that only authorized administrators can create and manage contests while allowing all authenticated users to register and participate.

## Implementation Details

### Authorization Check

The following endpoints now require admin privileges:

1. **POST /api/contests** - Create new contests
   - Returns `403 Forbidden` if user is not an admin
   - Returns `401 Unauthorized` if user is not authenticated

2. **POST /api/admin/create-sample-contests** - Create sample contests
   - Returns `403 Forbidden` if user is not an admin
   - Returns `401 Unauthorized` if user is not authenticated

### Access Control Flow

```
POST /api/contests
    ↓
Check Authentication
    ↓ NOT AUTHENTICATED
    └─→ 401 Unauthorized
    ↓ AUTHENTICATED
Check Admin Status
    ↓ NOT ADMIN
    └─→ 403 Forbidden (Only admins can create contests)
    ↓ IS ADMIN
    └─→ Create Contest (200 OK)
```

## User Permissions Matrix

| Action | Regular Users | Admin Users |
|--------|---------------|-------------|
| Browse Contests | ✅ | ✅ |
| Register for Contest | ✅ | ✅ |
| Participate in Contest | ✅ | ✅ |
| View Leaderboard | ✅ | ✅ |
| Submit Score | ✅ | ✅ |
| View Ratings | ✅ | ✅ |
| **Create Contest** | ❌ 403 | ✅ |
| **Create Sample Contests** | ❌ 403 | ✅ |

## How to Make a User Admin

To enable a user to create contests, add the `isAdmin` field to their user document in MongoDB:

```javascript
db.users.updateOne(
  { email: "admin@example.com" },
  { $set: { isAdmin: true } }
)
```

## Authentication User Type

The `AuthUser` type now includes the optional `isAdmin` field:

```typescript
export type AuthUser = {
  id: string;
  name: string;
  email: string;
  isAdmin?: boolean;
};
```

## API Response Examples

### ✅ Admin Successfully Creates Contest

```bash
curl -X POST http://localhost:3000/api/contests \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Advanced Interview Challenge",
    "description": "For experienced candidates",
    "startDate": "2026-06-01T00:00:00Z",
    "endDate": "2026-06-07T23:59:59Z",
    "rules": "Complete 5 questions",
    "maxParticipants": 500
  }'
```

Response (200 OK):
```json
{
  "ok": true,
  "id": "507f1f77bcf86cd799439011"
}
```

### ❌ Non-Admin Attempt to Create Contest

```bash
curl -X POST http://localhost:3000/api/contests \
  -H "Authorization: Bearer <user-token>" \
  -H "Content-Type: application/json" \
  -d '{...}'
```

Response (403 Forbidden):
```json
{
  "ok": false,
  "error": "Only admins can create contests"
}
```

### ❌ Unauthenticated Attempt

```bash
curl -X POST http://localhost:3000/api/contests \
  -H "Content-Type: application/json" \
  -d '{...}'
```

Response (401 Unauthorized):
```json
{
  "ok": false,
  "error": "Unauthorized"
}
```

## Files Modified

1. **lib/auth.ts**
   - Added `isAdmin?: boolean` to `AuthUser` type
   - No changes to JWT verification (isAdmin can be added to token or checked from DB)

2. **app/api/contests/route.ts**
   - Added admin check to POST handler
   - Returns 403 if user is not admin

3. **app/api/admin/create-sample-contests/route.ts**
   - Added admin check to POST handler
   - Returns 403 if user is not admin

## Contest Participation (No Changes)

All authenticated users can still:
- Browse contests (GET /api/contests)
- Register for contests (POST /api/contests/[id]/register)
- View contest details (GET /api/contests/[id]/register)
- View leaderboards (GET /api/contests/[id]/leaderboard)
- Submit scores (POST /api/contests/[id]/score)
- View their ratings (GET /api/users/stats)

## Testing

### Test Admin Creation Works

1. Make sure a user has `isAdmin: true` in database
2. Get their auth token
3. Call POST /api/contests with that token
4. Should return 200 with contest ID

### Test Non-Admin Blocked

1. Get auth token for regular user
2. Call POST /api/contests with that token
3. Should return 403 with "Only admins can create contests"

## Future Enhancements

- Add admin dashboard to create/manage contests from UI
- Add role-based access control (RBAC) system
- Add audit logging for contest creation
- Add notifications when contests are created
- Add contest moderation features for admins

## Troubleshooting

**Q: I get "Only admins can create contests" but I should be an admin**
A: Check that your user document has `isAdmin: true` in MongoDB. The auth system should include this in the JWT token.

**Q: How do I promote a user to admin?**
A: Update the user document in MongoDB:
```javascript
db.users.updateOne(
  { _id: ObjectId("...") },
  { $set: { isAdmin: true } }
)
```

**Q: Can I create contests from the UI?**
A: Currently, contests can only be created via the API. UI for admin contest creation coming soon.

---

**Version 1.0.0 - May 31, 2026**
**Status: Active**
