# User System Documentation

## Overview
The user system manages user profiles, avatars, match statistics, and account operations. It provides endpoints for viewing profiles, updating personal information, managing avatars, viewing leaderboards, and account deletion.

## Quick Start

**Base URL:** `/api/user`

**Authentication:** Most endpoints require Bearer token authentication (marked with 🔒).

**Common Use Cases:**
- Get current user profile: `GET /api/user/me` 🔒
- Get any user's profile: `GET /api/user/:id`
- Update profile: `PUT /api/user/me` 🔒
- Upload avatar: `POST /api/user/avatar` 🔒 (multipart/form-data)
- Get avatar image: `GET /api/user/:userId/avatar`
- Delete avatar: `DELETE /api/user/avatar` 🔒
- View leaderboard: `GET /api/user/leaderboard`
- Logout: `POST /api/user/logout` 🔒
- Delete account: `DELETE /api/user/me` 🔒

**Important Notes:**
- The `avatar_url` field in responses contains just a filename (e.g., "123.png")
- To display avatars, construct the URL as: `/api/user/${userId}/avatar`
- All timestamps are in ISO 8601 format
- Field names use snake_case (e.g., `display_name`, `avatar_url`)

---

## API Endpoints

### 1. Get Current User Profile
**Endpoint:** `GET /me`

**Description:** Get the authenticated user's full profile. 🔒 Authentication required.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "user": {
    "id": 1,
    "email": "user@example.com",
    "display_name": "John Doe",
    "online": 1,
    "last_seen": "2025-12-05T14:20:00Z",
    "avatar_url": "1.png",
    "bio": "Hi there!",
    "wins": 10,
    "losses": 5
  }
}
```

**Fields:**
- `online` - 1 = online, 0 = offline
- `avatar_url` - Filename only (use `/api/user/:id/avatar` to display)
- `bio` - Can be null

**Error Cases:**
- `404` - User not found

---

### 2. Get User by ID
**Endpoint:** `GET /:id`

**Description:** Get any user's public profile. No authentication required.

**Response (200):**
```json
{
  "id": 1,
  "email": "user@example.com",
  "display_name": "John Doe",
  "online": 1,
  "last_seen": "2025-12-05T14:20:00Z",
  "avatar_url": "1.png",
  "bio": "Hi there!",
  "wins": 10,
  "losses": 5
}
```

**Error Cases:**
- `404` - User not found

**Example Usage (Frontend):**
```javascript
const getUser = async (userId) => {
  const response = await fetch(`/api/user/${userId}`);
  const user = await response.json();
  console.log(user.display_name);
};
```

---

### 3. Update Profile
**Endpoint:** `PUT /me`

**Description:** Update the authenticated user's profile. 🔒 Authentication required.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:** (All fields optional, at least 1 required)
```json
{
  "display_name": "New Name",
  "bio": "Updated bio text",
  "avatar_url": "custom.png"
}
```

**Response (200):**
```json
{
  "message": "Profile updated"
}
```

**Notes:**
- Fields not provided will remain unchanged
- `display_name` - Min 1 char, max 50 chars
- `bio` - Min 1 char, max 500 chars
- `avatar_url` - Usually set via avatar upload endpoint

**Example Usage (Frontend):**
```javascript
const updateProfile = async (token, updates) => {
  const response = await fetch('/api/user/me', {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(updates)
  });
  const result = await response.json();
  console.log(result.message);
};
```

---

### 4. Get Leaderboard
**Endpoint:** `GET /leaderboard`

**Description:** Get top 10 users ranked by wins. No authentication required.

**Response (200):**
```json
{
  "leaderboard": [
    {
      "id": 1,
      "display_name": "Pro Player",
      "wins": 50,
      "losses": 10
    },
    {
      "id": 2,
      "display_name": "Good Player",
      "wins": 40,
      "losses": 15
    }
  ]
}
```

**Sorting:** By `wins` (descending), then `losses` (ascending)

**Limit:** Top 10 users only

---

### 5. Upload Avatar
**Endpoint:** `POST /avatar`

**Description:** Upload a custom avatar image. 🔒 Authentication required.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**Request Body:**
- Form field name: `file`
- Allowed types: `image/jpeg`, `image/png`
- Max size: 2MB

**Response (201):**
```json
{
  "message": "Avatar uploaded",
  "avatar_url": "123.png"
}
```

**Error Cases:**
- `400` - No file uploaded OR Invalid file type
- `500` - Failed to save file

**Implementation Notes:**
- Saved as `{userId}.{ext}` (e.g., "123.png", "456.jpg")
- Overwrites existing avatar
- Automatically deletes old format if extension changes (jpg → png)

**Example Usage (Frontend):**
```javascript
const uploadAvatar = async (token, file) => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/user/avatar', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: formData
  });

  const result = await response.json();
  console.log(result.avatar_url); // e.g., "123.png"
};
```

---

### 6. Get Avatar Image
**Endpoint:** `GET /:userId/avatar`

**Description:** Get user's avatar image file. No authentication required. Returns default avatar if user has none.

**Response (200):** Binary image data (JPEG or PNG)

**Headers:**
- `Content-Type`: `image/png` or `image/jpeg`
- `Cache-Control`: `public, max-age=86400` (cached for 1 day)

**Error Cases:**
- `500` - Failed to retrieve file

**Example Usage (Frontend):**
```javascript
// Simple usage
<img src={`/api/user/${userId}/avatar`} alt="avatar" />

// With fallback
const avatarUrl = userId ? `/api/user/${userId}/avatar` : '/default.png';
<img src={avatarUrl} alt="avatar" />
```

**Important:** Do NOT use the `avatar_url` field from API responses directly as image src. It's just a filename like "123.png", not a valid URL.

---

### 7. Delete Avatar
**Endpoint:** `DELETE /avatar`

**Description:** Delete custom avatar and revert to default. 🔒 Authentication required.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "message": "Avatar deleted successfully"
}
```

**Error Cases:**
- `400` - Avatar doesn't exist or can't delete default avatar
- `500` - Failed to delete avatar file

**Implementation Notes:**
- Deletes avatar file from disk
- Sets `avatar_url` to "default.png" in database

---

### 8. Logout
**Endpoint:** `POST /logout`

**Description:** Logout current user and set status to offline. 🔒 Authentication required.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "message": "Logged out successfully."
}
```

**Error Cases:**
- `500` - Internal server error

**Important:** Frontend must delete the JWT token from localStorage/sessionStorage after receiving this response.

**Example Usage (Frontend):**
```javascript
const logout = async (token) => {
  await fetch('/api/user/logout', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  // Delete token from storage
  localStorage.removeItem('jwt');
  
  // Redirect to login page
  window.location.href = '/login';
};
```

---

### 9. Delete Account
**Endpoint:** `DELETE /me`

**Description:** Permanently delete user account and all associated data. 🔒 Authentication required.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:** `204 No Content`

**Error Cases:**
- `404` - User not found
- `500` - Failed to delete account

**Implementation Notes:**

**Cascading deletions performed:**
1. All match history records
2. All friendships (as sender or receiver)
3. Avatar file from disk
4. User record from user database
5. Auth record from auth service (via internal API)

**Warning:** This action is irreversible!

**Example Usage (Frontend):**
```javascript
const deleteAccount = async (token) => {
  if (!confirm('Are you sure? This action cannot be undone!')) {
    return;
  }

  const response = await fetch('/api/user/me', {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (response.status === 204) {
    localStorage.removeItem('jwt');
    window.location.href = '/';
  }
};
```

---

## Frontend Integration Example

### Simple React Profile Component
```javascript
import { useState, useEffect } from 'react';

export function UserProfile({ token, userId }) {
  const [user, setUser] = useState(null);
  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState('');

  useEffect(() => {
    // Fetch user profile
    const endpoint = userId ? `/api/user/${userId}` : '/api/user/me';
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
    
    fetch(endpoint, { headers })
      .then(r => r.json())
      .then(data => {
        const profile = data.user || data; // Handle both response formats
        setUser(profile);
        setBio(profile.bio || '');
      });
  }, [token, userId]);

  const handleAvatarUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    await fetch('/api/user/avatar', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });

    // Refresh profile
    window.location.reload();
  };

  const updateBio = async () => {
    await fetch('/api/user/me', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ bio })
    });
    setEditing(false);
  };

  if (!user) return <div>Loading...</div>;

  return (
    <div>
      {/* Avatar */}
      <img 
        src={`/api/user/${user.id}/avatar`} 
        alt="avatar" 
        width="100" 
        height="100"
        style={{ borderRadius: '50%' }}
      />
      
      {/* Upload button (only for own profile) */}
      {!userId && (
        <input 
          type="file" 
          accept="image/png,image/jpeg"
          onChange={handleAvatarUpload}
        />
      )}

      {/* Profile info */}
      <h2>{user.display_name}</h2>
      <p>
        <span style={{ color: user.online ? 'green' : 'gray' }}>
          {user.online ? '🟢 Online' : '⚫ Offline'}
        </span>
      </p>
      
      <p>Wins: {user.wins} | Losses: {user.losses}</p>

      {/* Bio */}
      {editing ? (
        <div>
          <textarea value={bio} onChange={e => setBio(e.target.value)} />
          <button onClick={updateBio}>Save</button>
          <button onClick={() => setEditing(false)}>Cancel</button>
        </div>
      ) : (
        <div>
          <p>{user.bio || 'No bio set'}</p>
          {!userId && <button onClick={() => setEditing(true)}>Edit Bio</button>}
        </div>
      )}
    </div>
  );
}
```

---

## Key Features

✅ Public profile viewing (no auth required for GET endpoints)
✅ Secure profile updates with validation
✅ Avatar upload with automatic format conversion
✅ Default avatar fallback for all users
✅ Cached avatar delivery (1 day cache)
✅ Comprehensive account deletion with cascade
✅ Online status tracking
✅ Win/loss statistics for leaderboard
✅ Type-safe with TypeBox schemas

---

## Error Handling Reference

| Status | Error | Cause |
|--------|-------|-------|
| 400 | No file uploaded | Avatar upload without file |
| 400 | Invalid file type | Avatar not JPEG/PNG |
| 400 | Avatar doesn't exist | Trying to delete default avatar |
| 404 | User not found | Invalid user ID |
| 500 | Failed to save file | Avatar upload disk error |
| 500 | Failed to delete account | Account deletion failure |
| 500 | Internal server error | Generic server error |

---

## Important Notes for Frontend Developers

### Avatar URL Pattern
**❌ Wrong:**
```javascript
// This gives you just "123.png", not a valid URL
<img src={user.avatar_url} />
```

**✅ Correct:**
```javascript
// Construct the proper endpoint URL
<img src={`/api/user/${user.id}/avatar`} />
```

### Field Name Casing
Backend uses **snake_case**:
- `display_name` (not `displayName`)
- `avatar_url` (not `avatarUrl`)
- `last_seen` (not `lastSeen`)

### Authentication
- JWT token stored in `localStorage` under key `'jwt'`
- Send as: `Authorization: Bearer ${token}`
- Must be deleted on logout and account deletion

### File Upload
Use `FormData` for avatar uploads:
```javascript
const formData = new FormData();
formData.append('file', fileObject);
// Do NOT set Content-Type header, browser sets it automatically
```

### Cache Considerations
- Avatar images cached for 24 hours
- To force reload after upload: add timestamp query `?t=${Date.now()}`
- Or use `window.location.reload()` for simplicity
