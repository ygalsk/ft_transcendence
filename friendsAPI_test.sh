#!/bin/bash

BASE_URL="http://localhost:8080"

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}🧪 Friends API Modular Tests${NC}"
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

register_user() {
    local email="$1"
    local password="$2"
    local display_name="$3"
    
    RESPONSE=$(make_request "POST" "$BASE_URL/api/auth/register" "" "{\"email\": \"$email\", \"password\": \"$password\", \"display_name\": \"$display_name\"}")
    if [[ "$(extract_status "$RESPONSE")" != "201" ]]; then
        echo -e "${YELLOW}User $display_name might already exist, continuing...${NC}"
    fi
}

login_user() {
    local email="$1"
    local password="$2"
    
    RESPONSE=$(make_request "POST" "$BASE_URL/api/auth/login" "" "{\"email\": \"$email\", \"password\": \"$password\"}")
    TOKEN=$(extract_body "$RESPONSE" | jq -r '.token // empty')
    
    if [[ -n "$TOKEN" && "$TOKEN" != "null" ]]; then
        echo "$TOKEN"
    else
        echo "LOGIN_FAILED"
    fi
}

get_user_id() {
    local token="$1"
    echo "$token" | cut -d. -f2 | base64 -d 2>/dev/null | jq -r '.userId' 2>/dev/null
}

# =============================================================================
# TEST 1: BASIC FRIEND REQUEST FLOW
# =============================================================================
test_basic_friend_request() {
    echo -e "\n${BLUE}🧪 TEST 1: Basic Friend Request Flow${NC}"
    
    TIMESTAMP=$(date +%s)
    EMAIL1="user1_${TIMESTAMP}@test.com"
    EMAIL2="user2_${TIMESTAMP}@test.com"
    
    # Setup users
    register_user "$EMAIL1" "password123" "User1"
    register_user "$EMAIL2" "password123" "User2"
    
    USER1_TOKEN=$(login_user "$EMAIL1" "password123")
    USER2_TOKEN=$(login_user "$EMAIL2" "password123")
    
    USER1_ID=$(get_user_id "$USER1_TOKEN")
    USER2_ID=$(get_user_id "$USER2_TOKEN")
    
    echo -e "${YELLOW}User1 ID: $USER1_ID, User2 ID: $USER2_ID${NC}"
    
    # User1 sends friend request to User2
    RESPONSE=$(make_request "POST" "$BASE_URL/api/user/friends" "$USER1_TOKEN" "{\"friend_id\": $USER2_ID}")
    FRIENDSHIP_ID=$(extract_body "$RESPONSE" | jq -r '.friendship_id // empty')
    print_result "Send friend request" "$(extract_status "$RESPONSE")" "201" "$(extract_body "$RESPONSE")"
    
    # User2 accepts the request
    RESPONSE=$(make_request "PATCH" "$BASE_URL/api/user/friends/$FRIENDSHIP_ID" "$USER2_TOKEN" '{"action": "accept"}')
    print_result "Accept friend request" "$(extract_status "$RESPONSE")" "200" "$(extract_body "$RESPONSE")"
    
    # Check both users' friends list
    RESPONSE=$(make_request "GET" "$BASE_URL/api/user/friends" "$USER1_TOKEN" "")
    print_result "User1 friends list" "$(extract_status "$RESPONSE")" "200" "$(extract_body "$RESPONSE")"
    
    RESPONSE=$(make_request "GET" "$BASE_URL/api/user/friends" "$USER2_TOKEN" "")
    print_result "User2 friends list" "$(extract_status "$RESPONSE")" "200" "$(extract_body "$RESPONSE")"
}

# =============================================================================
# TEST 2: FRIEND REQUEST VALIDATION
# =============================================================================
test_friend_request_validation() {
    echo -e "\n${BLUE}🧪 TEST 2: Friend Request Validation${NC}"
    
    TIMESTAMP=$(date +%s)
    EMAIL1="alice_${TIMESTAMP}@test.com"
    EMAIL2="bob_${TIMESTAMP}@test.com"
    
    # Setup users
    register_user "$EMAIL1" "password123" "Alice"
    register_user "$EMAIL2" "password123" "Bob"
    
    ALICE_TOKEN=$(login_user "$EMAIL1" "password123")
    BOB_TOKEN=$(login_user "$EMAIL2" "password123")
    
    ALICE_ID=$(get_user_id "$ALICE_TOKEN")
    BOB_ID=$(get_user_id "$BOB_TOKEN")
    
    echo -e "${YELLOW}Alice ID: $ALICE_ID, Bob ID: $BOB_ID${NC}"
    
    # Self-friend request (should fail)
    RESPONSE=$(make_request "POST" "$BASE_URL/api/user/friends" "$ALICE_TOKEN" "{\"friend_id\": $ALICE_ID}")
    print_result "Self friend request (should fail)" "$(extract_status "$RESPONSE")" "400" "$(extract_body "$RESPONSE")"
    
    # Non-existent user (should fail)
    RESPONSE=$(make_request "POST" "$BASE_URL/api/user/friends" "$ALICE_TOKEN" '{"friend_id": 999999}')
    print_result "Non-existent user (should fail)" "$(extract_status "$RESPONSE")" "404" "$(extract_body "$RESPONSE")"
    
    # Valid request
    RESPONSE=$(make_request "POST" "$BASE_URL/api/user/friends" "$ALICE_TOKEN" "{\"friend_id\": $BOB_ID}")
    print_result "Valid friend request" "$(extract_status "$RESPONSE")" "201" "$(extract_body "$RESPONSE")"
    
    # Duplicate request (should fail)
    RESPONSE=$(make_request "POST" "$BASE_URL/api/user/friends" "$ALICE_TOKEN" "{\"friend_id\": $BOB_ID}")
    print_result "Duplicate request (should fail)" "$(extract_status "$RESPONSE")" "409" "$(extract_body "$RESPONSE")"
    
    # No authentication (should fail)
    RESPONSE=$(make_request "POST" "$BASE_URL/api/user/friends" "" "{\"friend_id\": $BOB_ID}")
    print_result "No auth (should fail)" "$(extract_status "$RESPONSE")" "401" "$(extract_body "$RESPONSE")"
}

# =============================================================================
# TEST 3: FRIEND REQUEST ACCEPTANCE/DECLINE
# =============================================================================
test_friend_request_responses() {
    echo -e "\n${BLUE}🧪 TEST 3: Friend Request Accept/Decline${NC}"
    
    TIMESTAMP=$(date +%s)
    EMAIL1="sender_${TIMESTAMP}@test.com"
    EMAIL2="receiver_${TIMESTAMP}@test.com"
    EMAIL3="outsider_${TIMESTAMP}@test.com"
    
    # Setup users
    register_user "$EMAIL1" "password123" "Sender"
    register_user "$EMAIL2" "password123" "Receiver"  
    register_user "$EMAIL3" "password123" "Outsider"
    
    SENDER_TOKEN=$(login_user "$EMAIL1" "password123")
    RECEIVER_TOKEN=$(login_user "$EMAIL2" "password123")
    OUTSIDER_TOKEN=$(login_user "$EMAIL3" "password123")
    
    SENDER_ID=$(get_user_id "$SENDER_TOKEN")
    RECEIVER_ID=$(get_user_id "$RECEIVER_TOKEN")
    OUTSIDER_ID=$(get_user_id "$OUTSIDER_TOKEN")
    
    echo -e "${YELLOW}Sender ID: $SENDER_ID, Receiver ID: $RECEIVER_ID, Outsider ID: $OUTSIDER_ID${NC}"
    
    # Send friend request
    RESPONSE=$(make_request "POST" "$BASE_URL/api/user/friends" "$SENDER_TOKEN" "{\"friend_id\": $RECEIVER_ID}")
    FRIENDSHIP_ID=$(extract_body "$RESPONSE" | jq -r '.friendship_id // empty')
    print_result "Send friend request" "$(extract_status "$RESPONSE")" "201" "$(extract_body "$RESPONSE")"
    
    # Wrong user tries to accept (should fail)
    RESPONSE=$(make_request "PATCH" "$BASE_URL/api/user/friends/$FRIENDSHIP_ID" "$OUTSIDER_TOKEN" '{"action": "accept"}')
    print_result "Wrong user accepts (should fail)" "$(extract_status "$RESPONSE")" "403" "$(extract_body "$RESPONSE")"
    
    # Sender tries to accept own request (should fail)
    RESPONSE=$(make_request "PATCH" "$BASE_URL/api/user/friends/$FRIENDSHIP_ID" "$SENDER_TOKEN" '{"action": "accept"}')
    print_result "Self-accept (should fail)" "$(extract_status "$RESPONSE")" "403" "$(extract_body "$RESPONSE")"
    
    # Receiver accepts (should work)
    RESPONSE=$(make_request "PATCH" "$BASE_URL/api/user/friends/$FRIENDSHIP_ID" "$RECEIVER_TOKEN" '{"action": "accept"}')
    print_result "Receiver accepts" "$(extract_status "$RESPONSE")" "200" "$(extract_body "$RESPONSE")"
    
    # Try to accept again (should fail)
    RESPONSE=$(make_request "PATCH" "$BASE_URL/api/user/friends/$FRIENDSHIP_ID" "$RECEIVER_TOKEN" '{"action": "accept"}')
    print_result "Accept already accepted (should fail)" "$(extract_status "$RESPONSE")" "400" "$(extract_body "$RESPONSE")"
}

# =============================================================================
# TEST 4: FRIEND REMOVAL/DECLINE
# =============================================================================
test_friend_removal() {
    echo -e "\n${BLUE}🧪 TEST 4: Friend Removal/Decline${NC}"
    
    TIMESTAMP=$(date +%s)
    EMAIL1="remover_${TIMESTAMP}@test.com"
    EMAIL2="target_${TIMESTAMP}@test.com"
    
    # Setup users
    register_user "$EMAIL1" "password123" "Remover"
    register_user "$EMAIL2" "password123" "Target"
    
    REMOVER_TOKEN=$(login_user "$EMAIL1" "password123")
    TARGET_TOKEN=$(login_user "$EMAIL2" "password123")
    
    REMOVER_ID=$(get_user_id "$REMOVER_TOKEN")
    TARGET_ID=$(get_user_id "$TARGET_TOKEN")
    
    echo -e "${YELLOW}Remover ID: $REMOVER_ID, Target ID: $TARGET_ID${NC}"
    
    # Create and accept friendship
    RESPONSE=$(make_request "POST" "$BASE_URL/api/user/friends" "$REMOVER_TOKEN" "{\"friend_id\": $TARGET_ID}")
    FRIENDSHIP_ID=$(extract_body "$RESPONSE" | jq -r '.friendship_id // empty')
    
    RESPONSE=$(make_request "PATCH" "$BASE_URL/api/user/friends/$FRIENDSHIP_ID" "$TARGET_TOKEN" '{"action": "accept"}')
    print_result "Accept friendship for removal test" "$(extract_status "$RESPONSE")" "200" "$(extract_body "$RESPONSE")"
    
    # Remove friend using DELETE
    RESPONSE=$(make_request "DELETE" "$BASE_URL/api/user/friends/$TARGET_ID" "$REMOVER_TOKEN" "")
    print_result "Remove friend" "$(extract_status "$RESPONSE")" "204" ""
    
    # Try to remove again (should fail)
    RESPONSE=$(make_request "DELETE" "$BASE_URL/api/user/friends/$TARGET_ID" "$REMOVER_TOKEN" "")
    print_result "Remove non-existent (should fail)" "$(extract_status "$RESPONSE")" "404" "$(extract_body "$RESPONSE")"
    
    # Test decline pending request
    RESPONSE=$(make_request "POST" "$BASE_URL/api/user/friends" "$REMOVER_TOKEN" "{\"friend_id\": $TARGET_ID}")
    RESPONSE=$(make_request "DELETE" "$BASE_URL/api/user/friends/$REMOVER_ID" "$TARGET_TOKEN" "")
    print_result "Decline pending request" "$(extract_status "$RESPONSE")" "204" ""
}

# =============================================================================
# TEST 5: FRIENDS LISTING
# =============================================================================
test_friends_listing() {
    echo -e "\n${BLUE}🧪 TEST 5: Friends Listing${NC}"
    
    TIMESTAMP=$(date +%s)
    EMAIL1="social_${TIMESTAMP}@test.com"
    EMAIL2="friend1_${TIMESTAMP}@test.com"
    EMAIL3="friend2_${TIMESTAMP}@test.com"
    
    # Setup users
    register_user "$EMAIL1" "password123" "Social"
    register_user "$EMAIL2" "password123" "Friend1" 
    register_user "$EMAIL3" "password123" "Friend2"
    
    SOCIAL_TOKEN=$(login_user "$EMAIL1" "password123")
    FRIEND1_TOKEN=$(login_user "$EMAIL2" "password123")
    FRIEND2_TOKEN=$(login_user "$EMAIL3" "password123")
    
    SOCIAL_ID=$(get_user_id "$SOCIAL_TOKEN")
    FRIEND1_ID=$(get_user_id "$FRIEND1_TOKEN")
    FRIEND2_ID=$(get_user_id "$FRIEND2_TOKEN")
    
    echo -e "${YELLOW}Social ID: $SOCIAL_ID, Friend1 ID: $FRIEND1_ID, Friend2 ID: $FRIEND2_ID${NC}"
    
    # Initially empty friends list
    RESPONSE=$(make_request "GET" "$BASE_URL/api/user/friends" "$SOCIAL_TOKEN" "")
    print_result "Empty friends list" "$(extract_status "$RESPONSE")" "200" "$(extract_body "$RESPONSE")"
    FRIENDS_COUNT=$(extract_body "$RESPONSE" | jq '.friends | length')
    echo -e "${YELLOW}Friends count: $FRIENDS_COUNT${NC}"
    
    # Create friendships
    RESPONSE=$(make_request "POST" "$BASE_URL/api/user/friends" "$SOCIAL_TOKEN" "{\"friend_id\": $FRIEND1_ID}")
    FRIENDSHIP1_ID=$(extract_body "$RESPONSE" | jq -r '.friendship_id // empty')
    
    RESPONSE=$(make_request "POST" "$BASE_URL/api/user/friends" "$SOCIAL_TOKEN" "{\"friend_id\": $FRIEND2_ID}")
    FRIENDSHIP2_ID=$(extract_body "$RESPONSE" | jq -r '.friendship_id // empty')
    
    # Accept friendships
    RESPONSE=$(make_request "PATCH" "$BASE_URL/api/user/friends/$FRIENDSHIP1_ID" "$FRIEND1_TOKEN" '{"action": "accept"}')
    RESPONSE=$(make_request "PATCH" "$BASE_URL/api/user/friends/$FRIENDSHIP2_ID" "$FRIEND2_TOKEN" '{"action": "accept"}')
    
    # Check friends list with 2 friends
    RESPONSE=$(make_request "GET" "$BASE_URL/api/user/friends" "$SOCIAL_TOKEN" "")
    print_result "Friends list with 2 friends" "$(extract_status "$RESPONSE")" "200" "$(extract_body "$RESPONSE")"
    FRIENDS_COUNT=$(extract_body "$RESPONSE" | jq '.friends | length')
    echo -e "${YELLOW}Friends count: $FRIENDS_COUNT${NC}"
    
    # Verify friend data structure
    FIRST_FRIEND=$(extract_body "$RESPONSE" | jq '.friends[0] // empty')
    if [[ -n "$FIRST_FRIEND" ]]; then
        echo -e "${YELLOW}Sample friend data: $FIRST_FRIEND${NC}"
    fi
}

# =============================================================================
# TEST 6: PENDING REQUESTS LISTING
# =============================================================================
test_pending_requests() {
    echo -e "\n${BLUE}🧪 TEST 6: Pending Requests Listing${NC}"
    
    TIMESTAMP=$(date +%s)
    EMAIL1="requester_${TIMESTAMP}@test.com"
    EMAIL2="requested_${TIMESTAMP}@test.com"
    
    # Setup users
    register_user "$EMAIL1" "password123" "Requester"
    register_user "$EMAIL2" "password123" "Requested"
    
    REQUESTER_TOKEN=$(login_user "$EMAIL1" "password123")
    REQUESTED_TOKEN=$(login_user "$EMAIL2" "password123")
    
    REQUESTER_ID=$(get_user_id "$REQUESTER_TOKEN")
    REQUESTED_ID=$(get_user_id "$REQUESTED_TOKEN")
    
    echo -e "${YELLOW}Requester ID: $REQUESTER_ID, Requested ID: $REQUESTED_ID${NC}"
    
    # Send friend request
    RESPONSE=$(make_request "POST" "$BASE_URL/api/user/friends" "$REQUESTER_TOKEN" "{\"friend_id\": $REQUESTED_ID}")
    print_result "Send friend request for pending test" "$(extract_status "$RESPONSE")" "201" "$(extract_body "$RESPONSE")"
    
    # Requester checks outgoing requests
    RESPONSE=$(make_request "GET" "$BASE_URL/api/user/friends/requests" "$REQUESTER_TOKEN" "")
    print_result "Requester pending requests" "$(extract_status "$RESPONSE")" "200" "$(extract_body "$RESPONSE")"
    OUTGOING_COUNT=$(extract_body "$RESPONSE" | jq '.outgoing | length')
    echo -e "${YELLOW}Outgoing requests: $OUTGOING_COUNT${NC}"
    
    # Requested user checks incoming requests  
    RESPONSE=$(make_request "GET" "$BASE_URL/api/user/friends/requests" "$REQUESTED_TOKEN" "")
    print_result "Requested pending requests" "$(extract_status "$RESPONSE")" "200" "$(extract_body "$RESPONSE")"
    INCOMING_COUNT=$(extract_body "$RESPONSE" | jq '.incoming | length')
    echo -e "${YELLOW}Incoming requests: $INCOMING_COUNT${NC}"
    
    # No auth test
    RESPONSE=$(make_request "GET" "$BASE_URL/api/user/friends/requests" "" "")
    print_result "Pending requests no auth (should fail)" "$(extract_status "$RESPONSE")" "401" "$(extract_body "$RESPONSE")"
}

# =============================================================================
# MAIN TEST RUNNER
# =============================================================================

echo -e "\n${BLUE}Choose tests to run:${NC}"
echo "1. Basic Friend Request Flow"
echo "2. Friend Request Validation"  
echo "3. Friend Request Accept/Decline"
echo "4. Friend Removal/Decline"
echo "5. Friends Listing"
echo "6. Pending Requests Listing"
echo "7. Run All Tests"
echo -e "\nComment/uncomment tests below to enable/disable them:\n"

# UNCOMMENT THE TESTS YOU WANT TO RUN:

test_basic_friend_request
test_friend_request_validation
test_friend_request_responses
test_friend_removal
test_friends_listing
test_pending_requests

echo -e "\n${BLUE}🎉 Selected tests completed!${NC}"
echo -e "${YELLOW}💡 Tip: Comment/uncomment test functions to run specific tests${NC}"