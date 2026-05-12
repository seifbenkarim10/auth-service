# 🔐 Auth Service

A standalone, production-ready authentication microservice built with **NestJS** and **MongoDB**. Designed to be reusable across multiple projects — register it once, call it from anywhere.

Any service that needs to verify a user's identity simply calls `GET /auth/validate` with a Bearer token. No shared code, no shared database, no coupling.

---

## Why a Standalone Auth Service?

Most projects bolt authentication onto the main application. It works, but it means every new project starts from scratch — reimplementing registration, password hashing, JWT handling, refresh token rotation, and logout logic.

This service solves that once. It:

- Runs independently on its own port and database
- Exposes a `/auth/validate` endpoint any service can call to verify tokens
- Can be reused across projects without modification
- Is simple enough to understand in one sitting, production-ready enough to actually use

---

## Architecture

```
┌─────────────────────┐         ┌─────────────────────┐
│   Your Application  │         │    Auth Service      │
│   (any project)     │         │    Port 3002         │
│                     │         │                      │
│  1. User sends      │         │  2. Validate token   │
│     Bearer token    │────────▶│  GET /auth/validate  │
│                     │         │         │            │
│  4. Allow/deny      │◀────────│  3. Returns user     │
│     request         │         │     or 401           │
└─────────────────────┘         └──────────┬───────────┘
                                            │
                                            ▼
                                   ┌─────────────────┐
                                   │    MongoDB       │
                                   │  (auth-service   │
                                   │   database)      │
                                   └─────────────────┘
```

### Token Flow

```
POST /auth/register or /auth/login
              ↓
   Returns accessToken (15min)
         + refreshToken (7d)
              ↓
   Client sends accessToken on every request
              ↓
   accessToken expires
              ↓
   Client calls POST /auth/refresh with refreshToken
              ↓
   New accessToken + refreshToken issued
   Old refreshToken invalidated in DB
              ↓
   POST /auth/logout
              ↓
   refreshToken deleted from DB
   No new accessTokens can be issued
```

### Why Two Tokens?

| Token | TTL | Purpose |
|---|---|---|
| `accessToken` | 15 minutes | Sent on every API request |
| `refreshToken` | 7 days | Used only to get a new accessToken |

Short-lived access tokens limit the damage if intercepted. The refresh token is sent infrequently and stored hashed in the database — meaning logout actually works (deleting the hash invalidates the refresh token permanently).

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Framework | NestJS | Modular, DI, decorator-based, production-ready |
| Database | MongoDB + Mongoose | Flexible, easy to run standalone |
| Auth | Passport.js (local + jwt) | Industry standard strategy pattern |
| Tokens | @nestjs/jwt | JWT signing and verification |
| Hashing | bcrypt (cost 12) | Slow by design — resistant to brute force |
| Config | @nestjs/config | Environment-based, 12-factor compliant |
| Validation | class-validator | DTO-level input validation |

---

## API Reference

### Auth

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/auth/register` | None | Create account, returns tokens |
| `POST` | `/api/v1/auth/login` | None | Login, returns tokens |
| `POST` | `/api/v1/auth/logout` | Bearer | Invalidate refresh token |
| `POST` | `/api/v1/auth/refresh` | Bearer | Rotate tokens |
| `GET` | `/api/v1/auth/validate` | Bearer | Verify token — for external services |

### Users

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/users/me` | Bearer | Get current user profile |
| `PUT` | `/api/v1/users/me` | Bearer | Update profile |

---

## Request & Response Examples

### Register
```http
POST /api/v1/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiJ9..."
}
```

### Login
```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

### Validate Token (called by external services)
```http
GET /api/v1/auth/validate
Authorization: Bearer <accessToken>
```
```json
{
  "valid": true,
  "user": {
    "_id": "...",
    "email": "user@example.com",
    "firstName": "Seif",
    "skills": ["nestjs", "mongodb"]
  }
}
```

### Refresh Tokens
```http
POST /api/v1/auth/refresh
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "refreshToken": "<refreshToken>"
}
```

### Update Profile
```http
PUT /api/v1/users/me
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "firstName": "Seif",
  "lastName": "Dev",
  "title": "Backend Developer",
  "location": "Tunisia",
  "skills": ["nestjs", "mongodb", "redis"]
}
```

---

## Security Design

### Password Storage
Passwords are hashed with bcrypt at cost factor 12 before storage. The plaintext password never touches the database. Even a full database leak exposes no recoverable passwords.

### Refresh Token Storage
Refresh tokens are hashed with bcrypt before being stored in MongoDB. When a user logs out, the hash is deleted — making the token permanently invalid even if someone intercepted it.

### Token Rotation
Every call to `/auth/refresh` issues a completely new access token and refresh token pair, and invalidates the old refresh token. This limits the window of exposure for any stolen refresh token.

### Input Validation
All endpoints validate input via `class-validator` DTOs before any business logic runs. Malformed requests are rejected at the controller level with a `400 Bad Request`.

---

## Data Model

```typescript
User {
  email: string          // unique, lowercase, indexed
  password: string       // bcrypt hashed, never returned in responses
  firstName?: string
  lastName?: string
  title?: string         // e.g. "Senior Backend Developer"
  location?: string
  skills: string[]
  isActive: boolean
  refreshToken?: string  // bcrypt hashed, null after logout
  createdAt: Date
  updatedAt: Date
}
```

---

## How to Integrate with Another Service

In your other NestJS service, create a simple auth guard that calls this service:

```typescript
// remote-auth.guard.ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class RemoteAuthGuard implements CanActivate {
  constructor(private http: HttpService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = request.headers.authorization;

    if (!token) throw new UnauthorizedException();

    try {
      const { data } = await firstValueFrom(
        this.http.get('http://localhost:3002/api/v1/auth/validate', {
          headers: { Authorization: token },
        }),
      );
      request.user = data.user;
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
```

Then use it on any route:
```typescript
@UseGuards(RemoteAuthGuard)
@Get('protected')
getProtected(@Req() req: any) {
  return req.user;
}
```

---

## Getting Started

### Prerequisites
- Node.js 18+
- MongoDB (local or Docker)
- npm

### 1. Clone

```bash
git clone https://github.com/your-username/auth-service.git
cd auth-service
```

### 2. Install

```bash
npm install
```

### 3. Configure

```bash
cp .env.example .env
```

```env
PORT=3002
MONGODB_URI=mongodb://localhost:27017/auth-service
JWT_SECRET=your_super_secret_jwt_key_change_this
JWT_REFRESH_SECRET=your_super_secret_refresh_key_change_this
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
```

> ⚠️ Change `JWT_SECRET` and `JWT_REFRESH_SECRET` to strong random strings in production.

### 4. Run

```bash
# development
npm run start:dev

# production
npm run build && npm run start:prod
```

Service starts at `http://localhost:3002/api/v1`.

---

## Project Structure

```
src/
├── app.module.ts
├── main.ts
├── config/
│   └── configuration.ts
└── modules/
    ├── auth/
    │   ├── decorators/
    │   │   └── current-user.decorator.ts
    │   ├── dto/
    │   │   ├── login.dto.ts
    │   │   ├── register.dto.ts
    │   │   └── refresh.dto.ts
    │   ├── guards/
    │   │   ├── jwt-auth.guard.ts
    │   │   └── local-auth.guard.ts
    │   ├── strategies/
    │   │   ├── jwt.strategy.ts
    │   │   └── local.strategy.ts
    │   ├── auth.controller.ts
    │   ├── auth.service.ts
    │   └── auth.module.ts
    └── users/
        ├── dto/
        │   └── update-profile.dto.ts
        ├── schemas/
        │   └── user.schema.ts
        ├── users.service.ts
        └── users.module.ts
```

---

## Scripts

```bash
npm run start:dev     # development with hot reload
npm run build         # compile TypeScript
npm run start:prod    # run compiled build
npm run lint          # ESLint
npm run test          # unit tests
```

---

## Production Checklist

- [ ] Change `JWT_SECRET` to a strong random string (32+ chars)
- [ ] Change `JWT_REFRESH_SECRET` to a different strong random string
- [ ] Set `MONGODB_URI` to a secured MongoDB instance
- [ ] Run behind a reverse proxy (nginx)
- [ ] Enable HTTPS
- [ ] Set `NODE_ENV=production`
- [ ] Add rate limiting to `/auth/login` and `/auth/register`

---

## License

MIT