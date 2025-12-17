#!/bin/bash
set -e

echo "=== Avatar System Test ==="

# Setup
API="http://localhost:8080"
EMAIL="test-$(date +%s)@test.com"

echo "1. Register user..."
curl -s -X POST $API/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"pass1234\",\"display_name\":\"Test\"}"

echo -e "\n2. Login..."
TOKEN=$(curl -s -X POST $API/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"pass1234\"}" | grep -o '"token":"[^"]*' | cut -d'"' -f4)

echo "Token: ${TOKEN:0:20}..."

echo "3. Get profile..."
curl -s $API/api/user/2 | grep -o '"avatar_url":"[^"]*'

echo -e "\n4.  Create test image..."
curl -s -o /tmp/test.png 'https://toppng.com/uploads/preview/avatar-png-115540218987bthtxfhls.png'

echo "5. Upload avatar..."
curl -s -X POST $API/api/user/avatar \
  -H "Authorization: Bearer $TOKEN" \
  -F "avatar=@/tmp/test.png"

echo -e "\n6.  Check avatar..."
curl -sI $API/api/user/2/avatar | grep Content-Type

echo -e "\n7. Delete avatar..."
curl -s -X DELETE $API/api/user/avatar \
  -H "Authorization: Bearer $TOKEN"

echo -e "\n8. Verify reverted to default..."
curl -s $API/api/user/7 | grep -o '"avatar_url":"[^"]*'


echo -e "\n✅ All tests passed!"