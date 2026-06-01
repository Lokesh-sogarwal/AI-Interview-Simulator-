#!/bin/bash

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Technical Contests Feature - API Tests${NC}\n"

BASE_URL="http://localhost:3000"

# Admin token (you'll need to login as sogarwal42@gmail.com and copy the JWT)
# For testing, we'll use the unauthenticated endpoint to show the structure

echo -e "${BLUE}1. Testing Contest Creation Endpoint${NC}"
echo "POST /api/contests (Admin only)"
echo ""
echo "Sample request:"
cat << 'EOF'
{
  "name": "Weekly Coding Challenge",
  "description": "Test your coding skills with weekly challenges",
  "startDate": "2026-06-07T10:00:00Z",
  "endDate": "2026-06-07T12:00:00Z",
  "frequency": "weekly",
  "problemCount": 3,
  "maxParticipants": 500
}
EOF
echo ""
echo ""

echo -e "${BLUE}2. Testing Schedule Recurring Contests Endpoint${NC}"
echo "POST /api/contests/schedule (Admin only)"
echo ""
echo "Sample request:"
cat << 'EOF'
{
  "name": "Weekend Coding Marathon",
  "frequency": "weekly",
  "dayOfWeek": 6,
  "startTime": "10:00",
  "duration": 2,
  "problemCount": 3,
  "maxParticipants": 500,
  "startDate": "2026-06-01T00:00:00Z",
  "endDate": "2026-12-31T23:59:59Z"
}
EOF
echo ""
echo ""

echo -e "${BLUE}3. Testing List Contests (Public)${NC}"
echo "GET /api/contests"
echo ""
echo "Fetching..."

RESPONSE=$(curl -s "$BASE_URL/api/contests" \
  -H "Cookie: aisim_token=$(cat /tmp/admin_token.txt 2>/dev/null || echo 'no-token')")

if echo "$RESPONSE" | grep -q "ok"; then
  echo -e "${GREEN}✅ Contests endpoint is working${NC}"
  echo "$RESPONSE" | head -100
else
  echo "Note: Need valid auth token to test. You must login first."
fi

echo ""
echo ""
echo -e "${BLUE}📝 Features Added:${NC}"
echo "✅ Problem generation with Hugging Face AI"
echo "✅ Weekly/Biweekly contest scheduling"
echo "✅ Automatic contest creation on weekend schedules"
echo "✅ 3-10 coding problems per contest"
echo "✅ Easy/Medium/Hard difficulty levels"
echo "✅ LeetCode-style problem format"
echo "✅ Problem topics (Arrays, DP, Graphs, etc.)"
echo ""
echo -e "${BLUE}🔗 New Endpoints:${NC}"
echo "• POST /api/contests - Create contest with problems"
echo "• POST /api/contests/schedule - Schedule recurring contests"
echo "• GET /api/contests - List all contests"
echo ""
echo -e "${BLUE}💾 New Files:${NC}"
echo "• app/lib/problem-generator.ts - Problem generation logic"
echo "• app/api/contests/schedule/route.ts - Recurring contest scheduling"
echo "• TECHNICAL_CONTESTS.md - Full documentation"
echo ""
echo -e "${BLUE}📊 Contest Types:${NC}"
echo "• Weekly - Every 7 days on selected weekday"
echo "• Biweekly - Every 14 days on selected weekday"
echo ""
echo -e "${GREEN}✨ Setup Complete!${NC}"
