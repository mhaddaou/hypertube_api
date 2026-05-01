# Hypertube — Backend API

NestJS REST API for the Hypertube project. Handles authentication (local, 42 OAuth, Google OAuth), user management, JWT session management, and exposes a RESTful API documented with Swagger.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | NestJS 11 (Express adapter) |
| Language | TypeScript 5 |
| Database | PostgreSQL |
| ORM | Prisma 7 (adapter-pg) |
| Auth | Passport.js — local, JWT, 42 OAuth, Google OAuth |
| Tokens | JWT access (15m) + refresh (7d) with rotation |
| Email | Nodemailer (SMTP) |
| Validation | class-validator + class-transformer |
| Docs | Swagger / OpenAPI at `/api/docs` |
| Package manager | pnpm |

---

## Project Structure

```
src/
├── main.ts                        # Bootstrap — ValidationPipe, Swagger, global prefix /api
├── app.module.ts                  # Root module — wires all feature modules
│
├── prisma/
│   ├── prisma.module.ts           # Global Prisma module
│   └── prisma.service.ts          # PrismaClient wrapper with adapter-pg
│
├── mail/
│   ├── mail.module.ts             # Global Mail module
│   └── mail.service.ts            # Nodemailer — sends password reset emails
│
├── auth/
│   ├── auth.module.ts             # Imports JWT, Passport, registers all strategies
│   ├── auth.controller.ts         # Auth routes + OAuth2 client credentials controller
│   ├── auth.service.ts            # Core auth logic (register, login, OAuth upsert, tokens)
│   │
│   ├── strategies/
│   │   ├── local.strategy.ts      # passport-local — validates username + password
│   │   ├── jwt.strategy.ts        # passport-jwt — validates Bearer token + refreshToken in DB
│   │   ├── ft.strategy.ts         # passport-42  — 42 intranet OAuth
│   │   └── google.strategy.ts     # passport-google-oauth20 — Google OAuth
│   │
│   ├── guards/
│   │   ├── local-auth.guard.ts    # Triggers LocalStrategy
│   │   ├── jwt-auth.guard.ts      # Protects routes requiring a valid access token
│   │   ├── ft-auth.guard.ts       # Triggers FtStrategy
│   │   ├── google-auth.guard.ts   # Triggers GoogleStrategy
│   │   └── oauth-client.guard.ts  # Validates client_id + client_secret for M2M tokens
│   │
│   ├── dto/
│   │   ├── register.dto.ts        # email, username, firstName, lastName, password
│   │   ├── login.dto.ts           # username, password
│   │   ├── refresh.dto.ts         # refresh_token
│   │   ├── forgot-password.dto.ts # email
│   │   ├── reset-password.dto.ts  # token, newPassword
│   │   └── oauth-token.dto.ts     # grant_type, client_id, client_secret
│   │
│   └── decorators/
│       └── current-user.decorator.ts  # @CurrentUser() param decorator
│
├── users/
│   ├── users.module.ts
│   ├── users.controller.ts        # GET /users, GET /users/:id, PATCH /users/:id
│   ├── users.service.ts           # findAll, findById (email hidden for others), updateUser
│   └── dto/
│       ├── update-user.dto.ts     # All fields optional
│       └── user-response.dto.ts   # UserListItemDto, UserPublicProfileDto, UserOwnProfileDto
│
└── common/
    └── types/
        └── passport-42.d.ts       # Manual type declaration for passport-42
```

---

## Database Schema

```
User
├── id             UUID (PK)
├── email          String (unique)
├── username       String (unique)
├── firstName      String
├── lastName       String
├── passwordHash   String?     — null for pure-OAuth users
├── profilePicture String?     — CDN URL
├── language       String      — default "en"
├── refreshToken   String?     — bcrypt-hashed; null when logged out
├── resetTokenHash String?     — bcrypt-hashed one-time reset token
├── resetTokenExp  DateTime?   — expiry of the reset token (1 hour)
├── oauthAccounts  OAuthAccount[]
├── createdAt      DateTime
└── updatedAt      DateTime

OAuthAccount
├── id         UUID (PK)
├── provider   String          — "42" | "google"
├── providerId String          — UID from the provider
├── userId     String (FK → User, cascade delete)
└── @@unique([provider, providerId])

OAuthClient                    — for machine-to-machine API access
├── id           UUID (PK)
├── clientId     String (unique)
├── clientSecret String        — bcrypt-hashed
├── name         String
└── createdAt    DateTime
```

---

## API Endpoints

### Auth — `/api/auth`

| Method | Path | Guard | Description |
|--------|------|-------|-------------|
| POST | `/auth/register` | — | Register with email, username, name, password |
| POST | `/auth/login` | LocalAuthGuard | Login → `{ access_token, refresh_token, user_data }` |
| POST | `/auth/logout` | JwtAuthGuard | Null out refreshToken in DB |
| POST | `/auth/refresh` | — | Rotate refresh token → new token pair |
| GET | `/auth/42` | FtAuthGuard | Redirect to 42 intranet OAuth |
| GET | `/auth/42/callback` | FtAuthGuard | 42 callback → JWT → redirect to frontend |
| GET | `/auth/google` | GoogleAuthGuard | Redirect to Google OAuth |
| GET | `/auth/google/callback` | GoogleAuthGuard | Google callback → JWT → redirect to frontend |
| POST | `/auth/forgot-password` | — | Send password reset email |
| POST | `/auth/reset-password` | — | Consume token, set new password |

### OAuth2 M2M — `/api/oauth`

| Method | Path | Guard | Description |
|--------|------|-------|-------------|
| POST | `/oauth/token` | OAuthClientGuard | Client credentials → `{ access_token, token_type, expires_in }` |

### Users — `/api/users`

| Method | Path | Guard | Description |
|--------|------|-------|-------------|
| GET | `/users` | JwtAuthGuard | List all users `{ id, username }` |
| GET | `/users/:id` | JwtAuthGuard | Profile — email shown only to owner |
| PATCH | `/users/:id` | JwtAuthGuard | Update own profile (403 if not owner) |

---

## Token Flow

```
Login / OAuth callback
  └─ issues access_token  (JWT, 15m, stateless)
  └─ issues refresh_token (JWT, 7d, hashed + stored in DB)

Every protected request
  └─ Authorization: Bearer <access_token>
  └─ JwtStrategy validates signature + checks refreshToken != null in DB

Logout
  └─ POST /api/auth/logout → sets refreshToken = null in DB
  └─ access_token expires naturally after 15m

Token refresh
  └─ POST /api/auth/refresh { refresh_token }
  └─ validates against DB hash → issues new pair (rotation)

OAuth callback redirect to frontend
  └─ http://localhost:5173/auth/callback
       ?access_token=eyJ...
       &refresh_token=eyJ...
       &user_data=<base64-encoded JSON>

Decode user_data on the frontend:
  const userData = JSON.parse(atob(searchParams.get('user_data')))
```

### Login response shape

```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "user_data": {
    "id": "ecec867a-...",
    "email": "user@example.com",
    "username": "mhaddaou",
    "firstName": "Mohamed",
    "lastName": "Haddaoui",
    "profilePicture": "https://cdn.intra.42.fr/.../medium_mhaddaou.jpg",
    "language": "en"
  }
}
```

---

## Environment Variables

Create a `.env` file at the project root:

```dotenv
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/hypertube"

# Server
PORT=3000
FRONTEND_URL="http://localhost:5173"

# JWT
JWT_SECRET="change-me-in-production"
JWT_ACCESS_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"

# 42 OAuth — https://profile.intra.42.fr/oauth/applications
OAUTH_42_CLIENT_ID=""
OAUTH_42_CLIENT_SECRET=""
OAUTH_42_CALLBACK_URL="http://localhost:3000/api/auth/42/callback"

# Google OAuth — https://console.cloud.google.com
OAUTH_GOOGLE_CLIENT_ID=""
OAUTH_GOOGLE_CLIENT_SECRET=""
OAUTH_GOOGLE_CALLBACK_URL="http://localhost:3000/api/auth/google/callback"

# SMTP (for password reset emails)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_USER=""
SMTP_PASS=""
SMTP_FROM="Hypertube <noreply@hypertube.com>"
```

---

## Setup & Run

```bash
# 1. Install dependencies
pnpm install

# 2. Copy and fill in environment variables
cp .env.example .env

# 3. Run database migrations
pnpm exec prisma migrate dev

# 4. (Optional) Seed an OAuthClient for M2M token testing
pnpm exec prisma db seed

# 5. Start development server
pnpm start:dev

# 6. Open Swagger UI
open http://localhost:3000/api/docs
```

---

## OAuth Setup

### 42 Intranet
1. Go to [profile.intra.42.fr/oauth/applications](https://profile.intra.42.fr/oauth/applications)
2. Create an app — set **Redirect URI** to `http://localhost:3000/api/auth/42/callback`
3. Copy Client ID and Secret into `.env`
4. Test at `http://localhost:3000/api/auth/42`

### Google
1. Go to [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials
2. Create OAuth 2.0 Client ID (Web application)
3. Add **Authorized redirect URI**: `http://localhost:3000/api/auth/google/callback`
4. Add your email as a **test user** (OAuth consent screen → Test users)
5. Copy Client ID and Secret into `.env`
6. Test at `http://localhost:3000/api/auth/google`

---

## Swagger

Available at `http://localhost:3000/api/docs` when the server is running.

Authenticate by clicking **Authorize** and pasting your `access_token` from a login or OAuth callback response.
