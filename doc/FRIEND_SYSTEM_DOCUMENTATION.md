# Friend System Documentation

## Overview
The friend system allows users to send friend requests, accept/decline them, view pending requests, and manage their friend list with online status tracking.

## Quick Start

**Base URL:** `/api/user/friends`

**Authentication:** All endpoints require Bearer token authentication.

**Common Use Cases:**
- Send friend request: `POST /api/user/friends` with `{"friend_id": userId}`
- Accept request: `PATCH /api/user/friends/:friendshipId` with `{"action": "accept"}`
- Decline/Cancel/Remove: `DELETE /api/user/friends/:friendId`
- View friends: `GET /api/user/friends`
- View pending requests: `GET /api/user/friends/requests`
- View online friends only: `GET /api/user/friends/online`

**Note:** To decline a friend request, use the DELETE endpoint, not PATCH. The PATCH endpoint only supports "accept".

---

## API Endpoints

### 1. Send Friend Request
**Endpoint:** `POST /friends`

**Description:** Send a friend request to another user. Authentication required.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "friend_id": 5
}
```

**Response (201):**
```json
{
  "message": "Friend request sent successfully",
  "friendship_id": 12
}
```

**Error Cases:**
- `400` - Cannot send friend request to yourself
- `404` - User not found
- `409` - Users are already friends OR Friend request already pending

**Example Usage (Frontend):**
```javascript
const sendFriendRequest = async (token, friendId) => {
  const response = await fetch('/api/friends', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ friend_id: friendId })
  });
  
  if (response.status === 201) {
    const result = await response.json();
    console.log(`Request sent! ID: ${result.friendship_id}`);
  }
};
```

---

### 2. Accept Friend Request
**Endpoint:** `PATCH /friends/:friendshipId`

**Description:** Accept a pending friend request. Authentication required. **Note:** This endpoint only supports "accept" action. To decline a request, use the DELETE endpoint instead.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Parameters:**
- `friendshipId` (path) - Friendship request ID (required)

**Request Body:**
```json
{
  "action": "accept"
}
```

**Response (200):**
```json
{
  "message": "Friend request accepted successfully"
}
```

**Error Cases:**
- `400` - Invalid friendship ID format OR Can only respond to pending requests
- `403` - Can only respond to requests sent to you
- `404` - Friend request not found

**Example Usage (Frontend):**
```javascript
const acceptFriendRequest = async (token, friendshipId) => {
  const response = await fetch(`/api/friends/${friendshipId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ action: 'accept' })
  });
  
  const result = await response.json();
  console.log(result.message);
};
```

---

### 3. Remove Friend / Decline Request / Cancel Request
**Endpoint:** `DELETE /friends/:friendId`

**Description:** Remove a friend, decline an incoming request, or cancel an outgoing request. Authentication required.

**Headers:**
```
Authorization: Bearer <token>
```

**Parameters:**
- `friendId` (path) - Friend/User ID (required)

**Response (204):**
No content returned on success.

**Error Cases:**
- `400` - Invalid friend ID format
- `404` - Friendship not found

**Details:**
- If you initiated a pending request → **cancels the request**
- If you received a pending request → **declines the request**
- If already friends → **removes the friend**

**Example Usage (Frontend):**
```javascript
const removeFriend = async (token, friendId) => {
  const response = await fetch(`/api/friends/${friendId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  if (response.status === 204) {
    console.log('Friendship removed/declined/canceled');
  }
};
```

---

### 4. Get Pending Friend Requests
**Endpoint:** `GET /friends/requests`

**Description:** Get all incoming and outgoing pending friend requests. Authentication required.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "incoming": [
    {
      "id": 12,
      "from_user_id": 2,
      "from_user_display_name": "John Doe",
      "avatar_url": "https://...",
      "created_at": "2025-12-05T10:30:00Z"
    }
  ],
  "outgoing": [
    {
      "id": 15,
      "to_user_id": 7,
      "to_user_display_name": "Jane Smith",
      "avatar_url": "https://...",
      "created_at": "2025-12-05T09:15:00Z"
    }
  ]
}
```

**Example Usage (Frontend):**
```javascript
const getPendingRequests = async (token) => {
  const response = await fetch('/api/friends/requests', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  const data = await response.json();
  
  console.log('Incoming requests:', data.incoming);
  console.log('Outgoing requests:', data.outgoing);
};
```

---

### 5. Get Friends List
**Endpoint:** `GET /friends`

**Description:** Get all accepted friends with their online status. Authentication required.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "friends": [
    {
      "id": 3,
      "display_name": "John Doe",
      "avatar_url": "https://...",
      "online": 1,
      "last_seen": "2025-12-05T14:20:00Z",
      "friendship_status": "accepted"
    },
    {
      "id": 5,
      "display_name": "Jane Smith",
      "avatar_url": "https://...",
      "online": 0,
      "last_seen": "2025-12-05T11:45:00Z",
      "friendship_status": "accepted"
    }
  ]
}
```

**Fields:**
- `online` - 1 = online, 0 = offline
- `last_seen` - When user was last online (only updated when going offline)

**Example Usage (Frontend):**
```javascript
const getFriendsList = async (token) => {
  const response = await fetch('/api/friends', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  const data = await response.json();
  
  data.friends.forEach(friend => {
    const status = friend.online ? '🟢 Online' : '⚫ Offline';
    console.log(`${friend.display_name} ${status}`);
  });
};
```

---

### 6. Get Online Friends
**Endpoint:** `GET /friends/online`

**Description:** Get only friends who are currently online. Authentication required.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "online_friends": [
    {
      "id": 3,
      "display_name": "John Doe",
      "avatar_url": "3.png",
      "last_seen": "2025-12-05T14:20:00Z"
    }
  ]
}
```

**Use Case:** Useful for showing online friends for game invites or chat features.

**Example Usage (Frontend):**
```javascript
const getOnlineFriends = async (token) => {
  const response = await fetch('/api/user/friends/online', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await response.json();
  console.log(`${data.online_friends.length} friends online`);
};
```

---

## Frontend Integration Example

### Simple React Example
```javascript
import { useState, useEffect } from 'react';

export function FriendsManager({ token }) {
  const [friends, setFriends] = useState([]);
  const [incoming, setIncoming] = useState([]);

  useEffect(() => {
    // Fetch friends and pending requests
    Promise.all([
      fetch('/api/user/friends', {
        headers: { 'Authorization': `Bearer ${token}` }
      }).then(r => r.json()),
      fetch('/api/user/friends/requests', {
        headers: { 'Authorization': `Bearer ${token}` }
      }).then(r => r.json())
    ]).then(([friendsData, requestsData]) => {
      setFriends(friendsData.friends);
      setIncoming(requestsData.incoming);
    });
  }, [token]);

  const acceptRequest = async (friendshipId) => {
    await fetch(`/api/user/friends/${friendshipId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ action: 'accept' })
    });
    // Refresh list
  };

  const removeFriend = async (friendId) => {
    await fetch(`/api/user/friends/${friendId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    // Refresh list
  };

  return (
    <div>
      <h3>Friend Requests ({incoming.length})</h3>
      {incoming.map(req => (
        <div key={req.id}>
          <img src={`/api/user/${req.from_user_id}/avatar`} alt="" width="40" />
          <span>{req.from_user_display_name}</span>
          <button onClick={() => acceptRequest(req.id)}>Accept</button>
          <button onClick={() => removeFriend(req.from_user_id)}>Decline</button>
        </div>
      ))}

      <h3>Friends ({friends.length})</h3>
      {friends.map(friend => (
        <div key={friend.id}>
          <img src={`/api/user/${friend.id}/avatar`} alt="" width="40" />
          <span>{friend.display_name}</span>
          <span>{friend.online ? '🟢' : '⚫'}</span>
          <button onClick={() => removeFriend(friend.id)}>Remove</button>
        </div>
      ))}
    </div>
  );
}
```

**Important:** Avatar URLs should be constructed as `/api/user/${userId}/avatar`, not using the `avatar_url` field directly (which is just a filename like "3.png").

---

## Database Schema

```sql
CREATE TABLE friendships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,        -- Sender
  friend_id INTEGER NOT NULL,       -- Recipient
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted')),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE,

  UNIQUE(user_id, friend_id),
  CHECK(user_id != friend_id)
);
```

---

## Key Features

✅ Bidirectional friendships (either can be sender/receiver)
✅ Pending requests (incoming & outgoing separated)
✅ Online status tracking with last_seen timestamp
✅ Prevents duplicate requests and self-friendship
✅ Cascade deletion when user is deleted
✅ Comprehensive error handling and logging
✅ Type-safe with TypeBox schemas

---

## Error Handling Reference

| Status | Error | Cause |
|--------|-------|-------|
| 400 | Cannot send friend request to yourself | Self-friendship attempt |
| 400 | Invalid friendship/friend ID format | Non-numeric ID |
| 400 | Can only respond to pending requests | Request already accepted |
| 403 | Can only respond to requests sent to you | Unauthorized action |
| 404 | User not found | Invalid user ID |
| 404 | Friend request not found | Invalid friendship ID |
| 404 | Friendship not found | No relationship exists |
| 409 | Users are already friends | Already connected |
| 409 | Friend request already pending | Duplicate request |
| 500 | Internal server error | Server error |
