# ft_transcendence

## Prerequisites

- Docker
- Docker Compose

## Quick Start

```bash
# Start development environment
make up

# Stop containers
make down

# Clean up (removes volumes)
make clean
```

## Access

- **Local**: http://localhost
- **Production**: https://transcendence.keystone-gateway.dev

## Tech Stack

**Frontend**
- Vite + TypeScript
- Tailwind CSS v4

**Backend**
- Fastify + TypeScript
- SQLite (better-sqlite3)

**Infrastructure**
- Caddy (reverse proxy + auto HTTPS)
- Docker + Docker Compose

## Architecture

```
Caddy (port 80/443)
├─→ / → Frontend (Vite dev server)
└─→ /api/* → Backend (Fastify)
```

## Development Notes

- Frontend and backend automatically reload on file changes
- Database file stored in `./data/` directory
- HTTPS certificates managed by Caddy (auto-renewal)

## Troubleshooting

**Containers won't start:**
```bash
make clean
make up
```

**Port already in use:**
- Check if something is running on ports 80, 443
- Stop other services or change ports in docker-compose.yaml
