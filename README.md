# ft_transcendence

**A modern, real-time multiplayer Pong game with tournament support, AI opponents, and comprehensive monitoring.**

[![Production](https://img.shields.io/badge/demo-live-success)](https://transcendence.keystone-gateway.dev)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

---

## 📖 Table of Contents

- [Description](#-description)
- [Team Information](#-team-information)
- [Project Management](#-project-management)
- [Technical Stack](#-technical-stack)
- [Features](#-features)
- [Module Points (20 Total)](#-module-points-20-total)
- [Database Schema](#-database-schema)
- [Individual Contributions](#-individual-contributions)
- [Installation & Setup](#-installation--setup)
- [Usage](#-usage)
- [Architecture](#-architecture)

---

## 🎯 Description

**ft_transcendence** is a comprehensive web-based implementation of the classic Pong game, built as the final project of the 42 School common core curriculum. This project demonstrates full-stack development capabilities, real-time multiplayer gaming, microservices architecture, and modern DevOps practices.

The application features:
- Real-time multiplayer Pong gameplay using WebSockets
- AI opponent for single-player mode
- Tournament system with bracket generation
- User authentication with 2FA support
- Friend system and online status tracking
- Comprehensive monitoring with Prometheus and Grafana
- Microservices backend architecture
- Modern React frontend with TypeScript

---

## 👥 Team Information

Our team followed an Agile/Scrum methodology with clearly defined roles:

| Member | Role | Responsibilities |
|--------|------|------------------|
| **sudaniel** | Product Owner | Vision, requirements prioritization, stakeholder communication, 2FA implementation, AI opponent, game logic |
| **dhasan** | Project Manager / Scrum Master | Sprint planning, standups, impediment removal, user management, remote players |
| **dkremer** | Technical Lead / Architect | Architecture decisions, code reviews, technical standards, WebSockets, monitoring system, microservices |
| **ycheroua** | Developer | Game implementation, browser compatibility, frontend features |
| **All Members** | Developers | Frontend & backend framework implementation, collaborative development |

---

## 📋 Project Management

### Methodology
We adopted **Agile/Scrum** with 1-2 week(s) sprints: 

- **Daily Standups**: Quick sync meetings every few days
- **Sprint Planning**: Clear task breakdown with time estimates
- **Code Reviews**: Mandatory peer review before merging
- **Pair Programming**: Complex features tackled collaboratively
- **Retrospectives**: Quick feedback sessions after each sprint

### Tools
- **GitHub**: Version control, issues, and project boards
- **Discord/Slack**: Real-time team communication

### Workflow
1. Issues created with clear acceptance criteria
2. Branches created from `main` for each feature
3. Pull requests with detailed descriptions
4. Code review by at least one team member
5. Merge after approval and passing checks

---

## 🛠️ Technical Stack

### Frontend
| Technology | Version | Justification |
|------------|---------|---------------|
| **React** | 18+ | Modern component-based UI library with excellent ecosystem and TypeScript support |
| **TypeScript** | 5+ | Type safety, better developer experience, reduced runtime errors |
| **Vite** | 5+ | Lightning-fast HMR, optimized builds, better developer experience than CRA |
| **Tailwind CSS** | v4 | Utility-first CSS for rapid UI development with consistent design |
| **Socket.IO Client** | 4+ | Real-time bidirectional communication for game state synchronization |
| **React Router** | 6+ | Client-side routing for SPA navigation |

### Backend
| Technology | Version | Justification |
|------------|---------|---------------|
| **Fastify** | 4+ | High-performance Node.js framework, faster than Express, excellent TypeScript support |
| **TypeScript** | 5+ | Type safety across the entire backend, shared types between services |
| **better-sqlite3** | 11+ | Fast, embedded database, perfect for development and moderate loads, ACID compliance |
| **Socket.IO** | 4+ | WebSocket implementation with fallback support and room management |
| **TypeBox** | Latest | JSON schema validation with TypeScript inference |
| **JWT** | - | Stateless authentication, secure token-based auth between microservices |

### Infrastructure & DevOps
| Technology | Version | Justification |
|------------|---------|---------------|
| **Docker** | 20+ | Containerization for consistent environments across dev/prod |
| **Docker Compose** | 2+ | Multi-container orchestration, simplified local development |
| **Caddy** | 2+ | Modern reverse proxy with automatic HTTPS via Let's Encrypt |
| **Prometheus** | Latest | Time-series metrics collection, industry standard for monitoring |
| **Grafana** | Latest | Visualization and alerting for metrics, rich dashboard ecosystem |

### Why Microservices? 
We chose a **microservices architecture** to:
- **Separate concerns**: Auth, User, and Pong services handle distinct domains
- **Independent scaling**: Services can scale based on load patterns
- **Fault isolation**:  Failures in one service don't crash the entire system
- **Technology flexibility**: Each service can be optimized independently
- **Team productivity**: Parallel development without conflicts

---

## ✨ Features

### Core Gameplay
- **Real-time Multiplayer Pong**: Smooth 60 FPS gameplay with WebSocket synchronization
- **AI Opponent**:  Single-player mode with adjustable difficulty
- **Responsive Controls**: Keyboard controls with smooth paddle movement
- **Game Statistics**: Track wins, losses, and match history

### User Management
- **Registration & Login**: Secure authentication with JWT tokens
- **Two-Factor Authentication (2FA)**: TOTP-based 2FA for enhanced security
- **User Profiles**: Customizable display names, avatars, and bios
- **Online Status**: Real-time online/offline status tracking
- **Friend System**: Send/accept/decline/remove friend requests, view friends list

### Tournament System
- **Bracket Generation**:  Automatic single-elimination tournament brackets
- **Public Tournaments**: Host open tournaments
- **Real-time Updates**: Live bracket updates as matches complete
- **Tournament History**: View past tournament results and standings

### Monitoring & Observability
- **Prometheus Metrics**: HTTP requests, WebSocket connections, database queries
- **Grafana Dashboards**: Pre-configured dashboards for system health
- **Service Health Checks**: Monitor microservice availability
- **Performance Tracking**: Response times, error rates, throughput

---

## 🏆 Module Points (20 Total)

### Major Modules (2 points each) = 14 points
### Minor Modules (1 point each) = 6 points

#### 1. Web-Based Game (2 pts)
**Implementation**: Full Pong game playable in the browser
- Canvas-based rendering with smooth animations
- Physics engine for ball movement and collision detection
- Score tracking and win conditions
- **Contributors**: sudaniel, ycheroua

#### 2. Remote Players (2 pts)
**Implementation**: Real-time multiplayer via WebSockets
- Socket.IO integration for bidirectional communication
- Game state synchronization between clients
- Room management for matchmaking
- Latency compensation techniques
- **Contributors**: dhasan

#### 3. Real-time Features with WebSockets (2 pts)
**Implementation**: Comprehensive WebSocket integration
- Pong game synchronization
- Online status updates
- Friend request notifications
- Tournament bracket updates
- Chat functionality (if implemented)
- **Contributors**:  dkremer, dhasan, sudaniel

#### 5. Standard User Management (2 pts)
**Implementation**: Complete authentication and user system
- Registration with email and password
- Secure login with JWT tokens
- Password hashing with bcrypt
- Session management
- Profile customization (avatar, bio, display name)
- **Contributors**:  dhasan, dkremer

#### 6. Monitoring System (Prometheus & Grafana) (2 pts)
**Implementation**: Full observability stack
- Prometheus metrics collection from all services
- Custom metrics for game-specific events
- Grafana dashboards for visualization
- Service health monitoring
- Performance and error tracking
- **Contributors**: dkremer


#### 7. Frontend Framework - React (1 pt)
**Implementation**: Modern React SPA with TypeScript
- Component-based architecture
- React Hooks for state management
- React Router for navigation
- Type-safe props and state
- **Contributors**: ycheroua

#### 8. Backend Framework - Fastify (1 pt)
**Implementation**: High-performance API server
- RESTful API endpoints
- Request validation with TypeBox
- Authentication middleware
- Error handling
- **Contributors**: All team members

#### 9. Tournament System (1 pt)
**Implementation**:  Complete tournament management
- Create public/private tournaments
- Automatic bracket generation
- Single-elimination logic
- Real-time match progression
- Tournament history and results
- **Contributors**: dkremer, sudaniel, dhasan

#### 10. Game Statistics Dashboard (1 pt) **needs eval**
**Implementation**: Comprehensive stats tracking
- Win/loss records per user
- Match history with scores
- Tournament participation history
- Leaderboards
- **Contributors**: dkremer, sudaniel, ycheroua

#### 11. Two-Factor Authentication (1 pt)
**Implementation**:  TOTP-based 2FA
- QR code generation for authenticator apps
- Time-based one-time password verification
- Optional 2FA during registration
- Secure secret storage
- **Contributors**: sudaniel

#### 12. Backend as Microservices (2 pts - Major)
**Implementation**: Three separate microservices
- **Auth Service**: Authentication, registration, 2FA
- **User Service**:  Profiles, friends, stats
- **Pong Service**: Game logic, matches, tournaments
- Inter-service communication with JWT
- Independent databases per service
- **Contributors**: sudaniel, dkremer

#### 13. AI Opponent (2 pt - Major)
**Implementation**: Single-player AI bot
- Difficulty levels (easy, medium, hard)
- Predictive ball tracking
- Realistic paddle movement
- **Contributors**: sudaniel

#### 14. Browser Compatibility (1 pt - Minor)
**Implementation**: Cross-browser support
- Tested on Chrome, Firefox, Safari, Edge
- Responsive design for various screen sizes
- Polyfills for older browsers
- **Contributors**: ycheroua

---

## 💾 Database Schema

We use **SQLite** databases with a microservices approach—each service has its own database for data isolation and independence. 

### Auth Service Database (`auth. sqlite`)

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  twofa_enabled INTEGER DEFAULT 0,
  twofa_secret TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

**Purpose**: Stores authentication credentials and 2FA secrets. 
5. Play your bracket matches when scheduled
### User Service Database (`user.sqlite`)

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY,  -- Synchronized from Auth service
  email TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  bio TEXT,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  online INTEGER DEFAULT 0,
  last_seen TEXT DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE match_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  winner_id INTEGER NOT NULL,
  loser_id INTEGER NOT NULL,
  left_score INTEGER NOT NULL,
  right_score INTEGER NOT NULL,
  played_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (winner_id) REFERENCES users(id),
  FOREIGN KEY (loser_id) REFERENCES users(id)
);

CREATE TABLE friendships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  friend_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted')),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, friend_id),
  CHECK(user_id != friend_id)
);
```

**Purpose**: User profiles, stats, match history, and friend relationships.

### Pong Service Database (`pong.sqlite`)

```sql
CREATE TABLE matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  winner_id INTEGER NOT NULL,
  loser_id INTEGER NOT NULL,
  left_score INTEGER NOT NULL,
  right_score INTEGER NOT NULL,
  duration INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tournaments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_by INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  max_players INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT,
  finished_at TEXT,
  winner_id INTEGER
);

CREATE TABLE tournament_players (
  tournament_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  display_name TEXT NOT NULL,
  seed INTEGER,
  joined_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tournament_id, user_id),
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
);

CREATE TABLE tournament_matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL,
  round INTEGER NOT NULL,
  match_index INTEGER NOT NULL,
  left_player_id INTEGER,
  right_player_id INTEGER,
  winner_id INTEGER,
  left_score INTEGER,
  right_score INTEGER,
  pong_match_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT,
  finished_at TEXT,
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
);
```

**Purpose**: Pong matches, tournament brackets, and game statistics.

### Database Design Decisions

- **SQLite**: Chosen for simplicity, ACID compliance, and zero configuration
- **Microservice Isolation**: Each service owns its data—no shared database
- **WAL Mode**: Enabled for better concurrent read/write performance
- **Indexes**: Created on frequently queried columns for performance
- **Foreign Keys**: Enforced for referential integrity

---

## 👨‍💻 Individual Contributions

### sudaniel (Product Owner)
**Total Contribution**:

- **2FA Implementation**: Designed and implemented TOTP-based two-factor authentication with QR code generation
- **AI Opponent**: Created single-player AI with difficulty levels and predictive algorithms
- **Game Logic**: Core Pong game mechanics, physics, collision detection
- **Tournament System**: Bracket logic and match progression (with dkremer, dhasan)
- **Microservices Architecture**: Backend service design and inter-service communication (with dkremer)
- **Product Vision**: Defined feature priorities and user stories
- **Code Reviews**: Reviewed and approved pull requests

### dhasan (Project Manager / Scrum Master)
**Total Contribution**:

- **Project Management**: Sprint planning, daily standups, task tracking via GitHub issues
- **User Management System**: Registration, login, JWT authentication (with dkremer)
- **Remote Players**: WebSocket integration for multiplayer Pong
- **Friend System**: Friend requests, acceptance, and status management
- **Tournament Features**: Tournament joining, player management (with dkremer, sudaniel)
- **Team Coordination**: Resolved blockers, facilitated communication
- **Testing**: Manual and integration testing across features

### dkremer (Technical Lead / Architect)
**Total Contribution**:

- **Architecture Design**: Microservices structure, service boundaries, API contracts
- **WebSocket Infrastructure**: Socket.IO plugin, room management, event handling (with dhasan, sudaniel)
- **Monitoring System**: Full Prometheus and Grafana setup with custom metrics
- **User Management**: Authentication middleware, password hashing, session handling (with dhasan)
- **Tournament System**: Bracket generation algorithm, seeding logic (with sudaniel, dhasan)
- **Microservices Backend**: Service-to-service authentication, shared plugins (with sudaniel)
- **Code Reviews**: Technical review of all PRs, enforced coding standards
- **DevOps**: Docker configuration, Caddy reverse proxy, production deployment

### ycheroua (Developer)
**Total Contribution**:

- **Game UI**:  Pong game canvas rendering and animations (with sudaniel)
- **Browser Compatibility**: Cross-browser testing and fixes for Chrome, Firefox, Safari, Edge
- **Frontend Features**: UI components, styling with Tailwind CSS
- **Responsive Design**: Mobile-friendly layouts (if applicable)
- **Bug Fixes**: Frontend bug identification and resolution

### Shared Contributions (All Members)
**Total Contribution**:

- **Framework Setup**: React frontend and Fastify backend scaffolding
- **Code Reviews**:  Peer review of all pull requests
- **Documentation**: Inline code comments, API documentation
- **Testing**: Manual testing, bug reporting
- **Meetings**: Daily standups, sprint planning, retrospectives

---

## 🚀 Installation & Setup

### Prerequisites

Ensure you have the following installed:

- **Docker**:  v20.0+ ([Install Docker](https://docs.docker.com/get-docker/))
- **Docker Compose**: v2.0+ (comes with Docker Desktop)
- **Make** (optional, for convenience commands)

### Step 1: Clone the Repository

```bash
git clone https://github.com/ygalsk/ft_transcendence.git
cd ft_transcendence
```

### Step 2: Configure Environment Variables

Copy the example environment file and configure it:

```bash
cp .env.example .env
```

Edit `.env` with your preferred values:

```env
# JWT Secrets (CHANGE THESE IN PRODUCTION)
JWT_SECRET=your-super-secret-jwt-key-change-in-production
SERVICE_JWT_SECRET=your-service-secret-key-change-in-production
SERVICE_SECRET=your-internal-service-secret

# Database Paths
AUTH_DB_PATH=/usr/src/app/data/auth.sqlite
USER_DB_PATH=/usr/src/app/data/user.sqlite
PONG_DB_PATH=/usr/src/app/data/pong.sqlite

# Grafana Admin Credentials
GF_SECURITY_ADMIN_USER=admin
GF_SECURITY_ADMIN_PASSWORD=admin
```

⚠️ **Security Warning**: Change all secrets before deploying to production!

### Step 3: Start the Application

Using Make (recommended):

```bash
make up
```

Or using Docker Compose directly:

```bash
docker-compose up --build
```

This will:
1. Build all Docker images (frontend, backend services, Caddy)
2. Start all containers (auth, user, pong, prometheus, grafana, caddy)
3. Initialize databases with schemas
4. Start the frontend dev server

### Step 4: Access the Application

- **Frontend**: [http://localhost](http://localhost)
- **Production**: [https://transcendence.keystone-gateway.dev](https://transcendence.keystone-gateway.dev)
- **Grafana Dashboard**: [http://localhost/dashboard](http://localhost/dashboard) (credentials: admin/admin)
- **Prometheus**: [http://localhost:9090](http://localhost:9090) (if exposed)

### Step 5: Create Your First Account

1. Navigate to [http://localhost](http://localhost)
2. Click "Register"
3. Fill in email, display name, and password
4. (Optional) Enable 2FA for enhanced security
5. Start playing! 

---

## 📖 Usage

### Playing Pong

#### Quick Match
1. Log in to your account or play as guest
2. Click "Play Now"
3. Wait for matchmaking or invite a friend
4. Use **W/S** or **Arrow Keys** to move your paddle
5. First to 11 points wins!

#### AI Opponent
1. Select "Play vs AI"
2. Choose difficulty (Easy / Medium / Hard)
3. Play against the AI bot

### Creating a Tournament

1. Navigate to "Tournaments"
2. Click "Create Tournament"
3. Set tournament name and max players
4. Start tournament once minimum players join

### Managing Your Profile

1. Click your avatar in the top-right
2. Select "Profile"
3. Update display name, bio, or avatar
4. View your stats (wins, losses, match history)
5. Enable/disable 2FA in settings

### Adding Friends

1. Search for users by display name
2. Click "Add Friend"
3. Wait for them to accept your request
4. See their online status in your friends list

---

## 🏗️ Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         Internet                            │
└────────────────────────┬────────────────────────────────────┘
                         │
                    HTTPS (443)
                         │
┌────────────────────────▼────────────────────────────────────┐
│                    Caddy (Reverse Proxy)                    │
│               Auto HTTPS with Let's Encrypt                 │
└─────┬──────────────────┬──────────────────┬─────────────────┘
      │                  │                  │
      │ /                │ /api/*           │ /dashboard/*
      │                  │                  │
┌─────▼──────┐     ┌─────▼─────────────────▼──────────────────┐
│  Frontend  │     │     Backend Microservices                │
│   (Vite)   │     │                                           │
│   : 5173    │     │  ┌──────────┐  ┌──────────┐  ┌────────┐ │
└────────────┘     │  │  Auth    │  │   User   │  │  Pong  │ │
                   │  │ Service  │  │ Service  │  │Service │ │
                   │  │  : 4000   │  │  :5000   │  │ :6061  │ │
                   │  └────┬─────┘  └────┬─────┘  └───┬────┘ │
                   │       │             │            │       │
                   │  ┌────▼─────────────▼────────────▼────┐ │
                   │  │     SQLite Databases (per service)  │ │
                   │  │  auth.sqlite user.sqlite pong.sqlite│ │
                   │  └─────────────────────────────────────┘ │
                   └───────────────────┬──────────────────────┘
                                       │
                              Metrics Collection
                                       │
                   ┌───────────────────▼──────────────────────┐
                   │            Prometheus + Grafana          │
                   │         (Monitoring & Dashboards)        │
                   └──────────────────────────────────────────┘
```

### Microservices Architecture

#### Auth Service (: 4000)
**Responsibilities**:
- User registration
- Login and JWT token generation
- Password hashing and verification
- 2FA setup and verification
- Internal service authentication

**Tech**:  Fastify, TypeScript, SQLite, JWT, TOTP

#### User Service (: 5000)
**Responsibilities**:
- User profile management
- Avatar uploads
- Friend system (add, accept, list)
- Online status tracking
- Match history
- Public user data API

**Tech**:  Fastify, TypeScript, SQLite, Multipart file upload

#### Pong Service (:6061)
**Responsibilities**: 
- Real-time Pong game logic via WebSockets
- Match creation and state management
- Tournament creation and bracket generation
- Game statistics and leaderboards
- AI opponent

**Tech**: Fastify, TypeScript, Socket.IO, SQLite

### Communication Patterns

- **Frontend ↔ Backend**: REST APIs (JSON over HTTP) + WebSockets (Socket.IO)
- **Service ↔ Service**: Internal HTTP APIs with JWT authentication
- **Database**:  Each service owns its SQLite database (no shared DB)
- **Monitoring**: All services expose `/metrics` endpoint for Prometheus

---

## 📚 Resources & AI Usage

### External Resources

- **42 Subject PDF**: [en.subject.pdf](./en.subject.pdf) - Official project requirements
- **Socket.IO Documentation**: [https://socket.io/docs/](https://socket.io/docs/)
- **Fastify Documentation**: [https://www.fastify.io/docs/](https://www.fastify.io/docs/)
- **React Documentation**: [https://react.dev/](https://react.dev/)
- **Prometheus Documentation**: [https://prometheus.io/docs/](https://prometheus.io/docs/)
- **Grafana Tutorials**: [https://grafana.com/tutorials/](https://grafana.com/tutorials/)

---

### Browser Compatibility

Tested on:
- ✅ Chrome
- ✅ Firefox
  
---

## 🐛 Troubleshooting

### Containers won't start

```bash
make clean  # or docker-compose down -v
make up     # or docker-compose up --build
```

### Port already in use

Check if ports 80, 443, or 5173 are occupied:

```bash
# Linux/Mac
lsof -i :80
lsof -i :443

# Windows
netstat -ano | findstr :80
```

Stop conflicting services or change ports in `docker-compose.yaml`.

### Database locked errors

SQLite databases use WAL mode for concurrency. If you encounter "database is locked": 
1. Ensure `busy_timeout` is set in DB plugin (already configured)
2. Restart affected service:  `docker-compose restart <service-name>`

### WebSocket connection issues

- Ensure Caddy is running and proxying `/api/pong` correctly
- Check browser console for Socket.IO connection errors
- Verify `CORS` settings in pong service allow your frontend origin

---

## 📝 License

This project is part of the 42 School curriculum and is intended for educational purposes. 

---

**Built with by dkremer, sudaniel, dhasan, ycheroua**

*Last updated: January 2026*
