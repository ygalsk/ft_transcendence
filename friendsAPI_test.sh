#!/bin/bash

BASE_URL="http://localhost:8080"

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}🧪 Testing Friends API${NC}"
echo "=================================="

print_result() {
    local test_name="$1"
    local status_code="$2"
    local expected="$3"
    local response_body="$4"
    
    if [[ "$status_code" == "$expected" ]]; then
        echo -e "${GREEN}✅ $test_name${NC}"
        return 0
    else
        echo -e "${RED}❌ $test_name - Expected: $expected, Got: $status_code${NC}"
        if [[ -n "$response_body" ]]; then
            echo -e "${YELLOW}   Response: $response_body${NC}"
        fi
        return 1
    fi
}

make_request() {
    local method="$1"
    local url="$2"
    local token="$3"
    local data="$4"
    
    if [[ -n "$data" ]]; then
        curl -s -w "HTTPSTATUS:%{http_code}" -X "$method" "$url" \
            -H "Content-Type: application/json" \
            ${token:+-H "Authorization: Bearer $token"} \
            -d "$data"
    else
        curl -s -w "HTTPSTATUS:%{http_code}" -X "$method" "$url" \
            ${token:+-H "Authorization: Bearer $token"}
    fi
}

extract_status() {
    echo "$1" | tr -d '\n' | sed -E 's/.*HTTPSTATUS:([0-9]{3})$/\1/'
}

extract_body() {
    echo "$1" | sed -E 's/HTTPSTATUS\:[0-9]{3}$//'
}

set -e

echo -e "\n${BLUE}📝 Setting up test users...${NC}"

# Register Alice
RESPONSE=$(make_request "POST" "$BASE_URL/api/auth/register" "" '{"email": "alice@test.com", "password": "password123", "display_name": "Alice"}')
print_result "Register Alice" "$(extract_status "$RESPONSE")" "201" "$(extract_body "$RESPONSE")"

# Register Bob  
RESPONSE=$(make_request "POST" "$BASE_URL/api/auth/register" "" '{"email": "bob@test.com", "password": "password123", "display_name": "Bob"}')
print_result "Register Bob" "$(extract_status "$RESPONSE")" "201" "$(extract_body "$RESPONSE")"

# Register Charlie
RESPONSE=$(make_request "POST" "$BASE_URL/api/auth/register" "" '{"email": "charlie@test.com", "password": "password123", "display_name": "Charlie"}')
print_result "Register Charlie" "$(extract_status "$RESPONSE")" "201" "$(extract_body "$RESPONSE")"

echo -e "\n${BLUE}🔐 Logging in users...${NC}"

# Login Alice
RESPONSE=$(make_request "POST" "$BASE_URL/api/auth/login" "" '{"email": "alice@test.com", "password": "password123"}')
ALICE_TOKEN=$(extract_body "$RESPONSE" | jq -r '.token // empty')
[[ -n "$ALICE_TOKEN" && "$ALICE_TOKEN" != "null" ]] || { echo "Alice login failed"; exit 1; }

# Login Bob
RESPONSE=$(make_request "POST" "$BASE_URL/api/auth/login" "" '{"email": "bob@test.com", "password": "password123"}')
BOB_TOKEN=$(extract_body "$RESPONSE" | jq -r '.token // empty')
[[ -n "$BOB_TOKEN" && "$BOB_TOKEN" != "null" ]] || { echo "Bob login failed"; exit 1; }

# Login Charlie - FIXED
RESPONSE=$(make_request "POST" "$BASE_URL/api/auth/login" "" '{"email": "charlie@test.com", "password": "password123"}')
CHARLIE_TOKEN=$(extract_body "$RESPONSE" | jq -r '.token // empty')
[[ -n "$CHARLIE_TOKEN" && "$CHARLIE_TOKEN" != "null" ]] || { echo "Charlie login failed"; exit 1; }

set +e

echo -e "\n${BLUE}👥 Testing Friend Requests - Valid Cases${NC}"

# Alice sends friend request to Bob
RESPONSE=$(make_request "POST" "$BASE_URL/api/user/friends" "$ALICE_TOKEN" '{"friend_id": 2}')
print_result "Send friend request (Alice → Bob)" "$(extract_status "$RESPONSE")" "201" "$(extract_body "$RESPONSE")"
FRIENDSHIP_ID_1=$(extract_body "$RESPONSE" | jq -r '.friendship_id // empty')

# Charlie sends friend request to Alice
RESPONSE=$(make_request "POST" "$BASE_URL/api/user/friends" "$CHARLIE_TOKEN" '{"friend_id": 1}')
print_result "Send friend request (Charlie → Alice)" "$(extract_status "$RESPONSE")" "201" "$(extract_body "$RESPONSE")"
FRIENDSHIP_ID_2=$(extract_body "$RESPONSE" | jq -r '.friendship_id // empty')

echo -e "\n${BLUE}🚫 Testing Friend Requests - Invalid Cases${NC}"

# Duplicate request
RESPONSE=$(make_request "POST" "$BASE_URL/api/user/friends" "$ALICE_TOKEN" '{"friend_id": 2}')
print_result "Duplicate friend request" "$(extract_status "$RESPONSE")" "409" "$(extract_body "$RESPONSE")"

# Self-friend request
RESPONSE=$(make_request "POST" "$BASE_URL/api/user/friends" "$ALICE_TOKEN" '{"friend_id": 1}')
print_result "Self friend request" "$(extract_status "$RESPONSE")" "400" "$(extract_body "$RESPONSE")"

# Non-existent user
RESPONSE=$(make_request "POST" "$BASE_URL/api/user/friends" "$ALICE_TOKEN" '{"friend_id": 999}')
print_result "Friend request to non-existent user" "$(extract_status "$RESPONSE")" "404" "$(extract_body "$RESPONSE")"

# No authentication  
RESPONSE=$(make_request "POST" "$BASE_URL/api/user/friends" "" '{"friend_id": 2}')
print_result "Friend request without auth" "$(extract_status "$RESPONSE")" "401" "$(extract_body "$RESPONSE")"

# Invalid token
RESPONSE=$(make_request "POST" "$BASE_URL/api/user/friends" "invalid-token" '{"friend_id": 2}')
print_result "Friend request with invalid token" "$(extract_status "$RESPONSE")" "401" "$(extract_body "$RESPONSE")"

# Invalid JSON
RESPONSE=$(make_request "POST" "$BASE_URL/api/user/friends" "$ALICE_TOKEN" '{"invalid": "data"}')
print_result "Friend request with invalid data" "$(extract_status "$RESPONSE")" "400" "$(extract_body "$RESPONSE")"

# Missing friend_id
RESPONSE=$(make_request "POST" "$BASE_URL/api/user/friends" "$ALICE_TOKEN" '{}')
print_result "Friend request without friend_id" "$(extract_status "$RESPONSE")" "400" "$(extract_body "$RESPONSE")"

# Invalid friend_id type
RESPONSE=$(make_request "POST" "$BASE_URL/api/user/friends" "$ALICE_TOKEN" '{"friend_id": "invalid"}')
print_result "Friend request with invalid friend_id type" "$(extract_status "$RESPONSE")" "400" "$(extract_body "$RESPONSE")"

echo -e "\n${BLUE}✅ Testing Friend Request Accept - Valid Cases${NC}"

# Bob accepts Alice's request
RESPONSE=$(make_request "PATCH" "$BASE_URL/api/user/friends/$FRIENDSHIP_ID_1" "$BOB_TOKEN" '{"action": "accept"}')
print_result "Accept friend request (Bob accepts Alice)" "$(extract_status "$RESPONSE")" "200" "$(extract_body "$RESPONSE")"

echo -e "\n${BLUE}❌ Testing Friend Request Accept - Invalid Cases${NC}"

# Try to accept already accepted request
RESPONSE=$(make_request "PATCH" "$BASE_URL/api/user/friends/$FRIENDSHIP_ID_1" "$BOB_TOKEN" '{"action": "accept"}')
print_result "Accept already accepted request" "$(extract_status "$RESPONSE")" "400" "$(extract_body "$RESPONSE")"

# Non-existent friendship ID
RESPONSE=$(make_request "PATCH" "$BASE_URL/api/user/friends/999" "$BOB_TOKEN" '{"action": "accept"}')
print_result "Accept non-existent friendship" "$(extract_status "$RESPONSE")" "404" "$(extract_body "$RESPONSE")"

# Invalid friendship ID format
RESPONSE=$(make_request "PATCH" "$BASE_URL/api/user/friends/invalid" "$BOB_TOKEN" '{"action": "accept"}')
print_result "Invalid friendship ID format" "$(extract_status "$RESPONSE")" "400" "$(extract_body "$RESPONSE")"

# Wrong user trying to accept (Alice trying to accept Charlie's request to Alice)
RESPONSE=$(make_request "PATCH" "$BASE_URL/api/user/friends/$FRIENDSHIP_ID_2" "$CHARLIE_TOKEN" '{"action": "accept"}')
print_result "Wrong user trying to accept" "$(extract_status "$RESPONSE")" "403" "$(extract_body "$RESPONSE")"

# Invalid action (decline no longer supported)
RESPONSE=$(make_request "PATCH" "$BASE_URL/api/user/friends/$FRIENDSHIP_ID_2" "$ALICE_TOKEN" '{"action": "decline"}')
print_result "Invalid action (decline not supported)" "$(extract_status "$RESPONSE")" "400" "$(extract_body "$RESPONSE")"

# Missing action
RESPONSE=$(make_request "PATCH" "$BASE_URL/api/user/friends/$FRIENDSHIP_ID_2" "$ALICE_TOKEN" '{}')
print_result "Missing action field" "$(extract_status "$RESPONSE")" "400" "$(extract_body "$RESPONSE")"

# No authentication for accept
RESPONSE=$(make_request "PATCH" "$BASE_URL/api/user/friends/$FRIENDSHIP_ID_2" "" '{"action": "accept"}')
print_result "Accept without authentication" "$(extract_status "$RESPONSE")" "401" "$(extract_body "$RESPONSE")"

echo -e "\n${BLUE}🗑️ Testing Friend Removal/Decline - Valid Cases${NC}"

# Alice declines Charlie's request using DELETE
RESPONSE=$(make_request "DELETE" "$BASE_URL/api/user/friends/3" "$ALICE_TOKEN" "")
print_result "Decline friend request via DELETE (Alice declines Charlie)" "$(extract_status "$RESPONSE")" "204" ""

# Create new requests for removal testing
RESPONSE=$(make_request "POST" "$BASE_URL/api/user/friends" "$BOB_TOKEN" '{"friend_id": 3}')
BOB_TO_CHARLIE_ID=$(extract_body "$RESPONSE" | jq -r '.friendship_id // empty')

# Bob cancels his own pending request
RESPONSE=$(make_request "DELETE" "$BASE_URL/api/user/friends/3" "$BOB_TOKEN" "")
print_result "Cancel own pending request" "$(extract_status "$RESPONSE")" "204" ""

# Alice removes Bob (they're already friends from earlier)
RESPONSE=$(make_request "DELETE" "$BASE_URL/api/user/friends/2" "$ALICE_TOKEN" "")
print_result "Remove accepted friend" "$(extract_status "$RESPONSE")" "204" ""

echo -e "\n${BLUE}❌ Testing Friend Removal/Decline - Invalid Cases${NC}"

# Try to remove non-existent friendship
RESPONSE=$(make_request "DELETE" "$BASE_URL/api/user/friends/2" "$ALICE_TOKEN" "")
print_result "Remove non-existent friendship" "$(extract_status "$RESPONSE")" "404" "$(extract_body "$RESPONSE")"

# Invalid friend ID format
RESPONSE=$(make_request "DELETE" "$BASE_URL/api/user/friends/invalid" "$ALICE_TOKEN" "")
print_result "Invalid friend ID format" "$(extract_status "$RESPONSE")" "400" "$(extract_body "$RESPONSE")"

# No authentication
RESPONSE=$(make_request "DELETE" "$BASE_URL/api/user/friends/2" "" "")
print_result "Remove friend without authentication" "$(extract_status "$RESPONSE")" "401" "$(extract_body "$RESPONSE")"

# Invalid token
RESPONSE=$(make_request "DELETE" "$BASE_URL/api/user/friends/2" "invalid-token" "")
print_result "Remove friend with invalid token" "$(extract_status "$RESPONSE")" "401" "$(extract_body "$RESPONSE")"

echo -e "\n${BLUE}🔄 Testing Edge Cases${NC}"

# Create fresh friendship for edge case testing
RESPONSE=$(make_request "POST" "$BASE_URL/api/user/friends" "$ALICE_TOKEN" '{"friend_id": 2}')
ALICE_TO_BOB_NEW=$(extract_body "$RESPONSE" | jq -r '.friendship_id // empty')

# Bob accepts
RESPONSE=$(make_request "PATCH" "$BASE_URL/api/user/friends/$ALICE_TO_BOB_NEW" "$BOB_TOKEN" '{"action": "accept"}')

# Try reverse friend request (should fail - already friends)
RESPONSE=$(make_request "POST" "$BASE_URL/api/user/friends" "$BOB_TOKEN" '{"friend_id": 1}')
print_result "Reverse friend request (already friends)" "$(extract_status "$RESPONSE")" "409" "$(extract_body "$RESPONSE")"

echo -e "\n${BLUE}✅ Testing Complete Friendship Lifecycle${NC}"

# Charlie sends request to Bob
RESPONSE=$(make_request "POST" "$BASE_URL/api/user/friends" "$CHARLIE_TOKEN" '{"friend_id": 2}')
CHARLIE_TO_BOB_ID=$(extract_body "$RESPONSE" | jq -r '.friendship_id // empty')
print_result "Create new request (Charlie → Bob)" "$(extract_status "$RESPONSE")" "201" "$(extract_body "$RESPONSE")"

# Bob accepts Charlie's request
RESPONSE=$(make_request "PATCH" "$BASE_URL/api/user/friends/$CHARLIE_TO_BOB_ID" "$BOB_TOKEN" '{"action": "accept"}')
print_result "Accept friend request (Bob accepts Charlie)" "$(extract_status "$RESPONSE")" "200" "$(extract_body "$RESPONSE")"

# Charlie removes Bob as friend
RESPONSE=$(make_request "DELETE" "$BASE_URL/api/user/friends/2" "$CHARLIE_TOKEN" "")
print_result "Remove friend (Charlie removes Bob)" "$(extract_status "$RESPONSE")" "204" ""

echo -e "\n${BLUE}🎉 Friends API Testing Complete!${NC}"
echo "=================================="
echo -e "${GREEN}New API Design:${NC}"
echo -e "  • POST /friends - Send friend request"
echo -e "  • PATCH /friends/:id {\"action\": \"accept\"} - Accept request only"
echo -e "  • DELETE /friends/:id - Decline, cancel, or remove friend"