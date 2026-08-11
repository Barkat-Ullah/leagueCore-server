<div align="center">

# ⚽ LeagueCore — Tournament Management System

**A full-featured backend platform for competitive soccer tournaments**  
*Create · Register · Compete · Track — All in One Place*

---

[![Node.js](https://img.shields.io/badge/Node.js-20.x-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-6.x-2D3748?style=for-the-badge&logo=prisma&logoColor=white)](https://www.prisma.io/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Express](https://img.shields.io/badge/Express-4.x-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.x-010101?style=for-the-badge&logo=socket.io&logoColor=white)](https://socket.io/)
[![Stripe](https://img.shields.io/badge/Stripe-Payments-635BFF?style=for-the-badge&logo=stripe&logoColor=white)](https://stripe.com/)

---
<a href="https://github.com/Barkat-Ullah/LeagueCore-server-script" target="_blank">
  <img src="https://img.shields.io/badge/%F0%9F%93%81%20GitHub%20Repository-181717?style=for-the-badge&logo=github&logoColor=white" height="52" alt="GitHub Repository"/>
</a>

</div>

---

## 📖 Overview

**LeagueCore** is a comprehensive **Soccer Tournament Management System** designed for competitive leagues at all age levels. The platform enables admins to create and manage multi-division tournaments across three competitive stages (Proving, Crown, Royal), while coaches can register teams, manage rosters, and track their standings in real time.

The system handles the complete tournament lifecycle — from creation and team registration to match scheduling, live scoring, player age verification, waiver management, referee assignment, and series points tracking — all backed by Stripe-powered payment processing.

---

## 🏗️ System Architecture

```
src/
├── app/
│   └── modules/
│       ├── auth/
│       │   ├── auth.routes.ts
│       │   ├── auth.controller.ts
│       │   ├── auth.service.ts
│       │   └── auth.validation.ts
│       ├── user/
│       │   ├── user.routes.ts
│       │   ├── user.controller.ts
│       │   ├── user.service.ts
│       │   └── user.validation.ts
│       ├── tournament/
│       ├── tournamentDivision/
│       ├── teams/
│       ├── teamRegistration/
│       ├── teamPlayer/
│       ├── match/
│       ├── referee/
│       ├── series/
│       ├── seriesPointsLedger/
│       ├── payment/
│       ├── notification/
│       ├── chat/
│       ├── activityLog/
│       └── ...
├── config/
├── middlewares/
├── utils/
├── helpers/
├── shared/
├── app.ts
└── server.ts
```

> **Modular Pattern:** Every feature module contains its own `routes`, `controller`, `service`, and `validation` — keeping concerns cleanly separated and the codebase highly scalable.

---

## 👥 Role-Based Access Control

| Role | Responsibilities |
|------|-----------------|
| **ADMIN** | Create & manage tournaments, divisions, referees, series fees, age verification, global dashboard |
| **COACH** | Register teams, add players, manage roster, pay registration fees, view schedules |
| **MANAGER** | Assist coach in team management, view team roster and match schedule |
| **PLAYER** | View assigned team, sign waivers, track match schedule and standings |

---

## ✨ Features

### 🔐 Auth & User Management
- JWT-based authentication with refresh token support
- OTP-based email verification
- Role-specific onboarding flows (Coach, Manager, Player)
- Self-referential user hierarchy (Coach creates Players/Managers)
- User status management: Active / Inactive / Suspended / Blocked
- FCM push notification token support
- Notification preference flags (match reminder, waiver alert, team update, email)

### 🏆 Tournament Management *(Admin)*
- Create tournaments with full metadata: name, dates, location, map link, registration deadline, number of fields, notes
- Game format support: `7v7`, `9v9`, `11v11`
- Tournament stages: **Proving → Crown → Royal** (series progression)
- Tournament status pipeline: `DRAFT → OPEN → LIVE → COMPLETED → CANCELLED`
- Configurable youth & adult registration fees
- Roster size cap (default: 12 players)
- Tournament logo upload
- Total registered teams counter

### 📂 Division Management *(Admin)*
- Multiple age/gender divisions per tournament:
  - Youth: U9–U10, U11–U12, U13–U14, U15–U16, U17–U18 (Boys & Girls)
  - High School: HS Boys / HS Girls
  - Adult: Men's Div 1/2/3, Women's, Co-Ed
- Per-division max teams, slots remaining, revenue tracking
- Division status: `PENDING → READY → ACTIVE → INACTIVE`
- Fee override per division
- Schedule readiness flag

### 🧑‍🤝‍🧑 Team Registration *(Coach)*
- Register a team into a specific tournament + division
- Team name, image, and division assignment
- Payment status tracking per registration (`PENDING → PAID`)
- Max players cap and registered player count
- Multi-manager support via `TeamManager` junction model

### 👨‍👩‍👧 Roster & Player Management *(Coach / My Contribution)*
- Add players to registered teams
- Per-player waiver status: `Pending → Signed`
- E-waiver: player name sign + timestamp
- Per-player age verification: `Check_in_required → Pending → Verified → Rejected`
- Soft-delete support for removed players
- Prevent duplicate player entries per team registration

### 🧾 Waiver & Age Verification *(Admin / My Contribution)*
- Admin-level age verification dashboard
- Review and approve/reject player age status
- Waiver signing tracked with signature name and date
- Alerts triggered via notification preferences

### 🎯 Match Scheduling *(Admin)*
- Schedule matches per tournament division
- Assign home and away teams, field number, date/time
- Referee assignment per match
- Match stages: `GROUP → QUARTER_FINAL → SEMI_FINAL → FINAL`
- Match status: `SCHEDULED → PUBLISHED → COMPLETED → CANCELLED`
- Score entry (home score / away score)
- Round tracking
- Publish/unpublish schedule control

### 🟨 Referee Management *(Admin / My Contribution)*
- Create and manage referee profiles (name, email, phone)
- Assign referees to individual matches
- Referee list accessible from admin dashboard

### 📊 Series Points & Standings
- Points ledger per team, per tournament, per division
- Tournament placement tracking: `WINNER / RUNNER_UP / SEMI_FINALIST / QUARTER_FINALIST / PARTICIPANT`
- Base points + win points = total points formula
- Series-wide leaderboard across all three tournament stages
- Per-team discount system for series bundle registrations

### 💳 Bundle Credit System *(My Contribution)*
- Coach-level bundle purchasing (`Youth` / `Adult`)
- Bundle credits used to register teams into tournaments
- `hasBundle`, `totalBundle` (max 4) tracked at user level
- Series fee configuration: youth fee + adult fee per stage

### 💰 Payment & Billing
- Stripe-powered payment processing
- Per-user Stripe customer and payment method storage
- Tournament-linked and registration-linked payments
- Payment status: `PENDING → AUTHORIZED → PAID → CANCELLED → FAILED`
- Card brand and cardholder name stored per transaction

### 💬 Real-Time Chat
- Room-based direct messaging between users
- Image sharing support in chat
- Read/unread status tracking

### 🔔 Notifications
- Per-user in-app notifications (title, body, data payload)
- Read/unread tracking
- FCM push notification delivery via Firebase Admin SDK
- Per-user toggles: match reminder, waiver alert, team update, email notify

### 📋 Activity Logs
- Per-user activity log trail (title + content)
- Admin-accessible for audit and review

---

## 📦 Tech Stack & Packages

### Core
| Package | Purpose |
|---------|---------|
| `express` | HTTP server & routing |
| `typescript` | Type safety across the codebase |
| `prisma` + `@prisma/client` | ORM for MongoDB |
| `mongodb` | Database driver |
| `ts-node-dev` | Development server with hot reload |

### Auth & Security
| Package | Purpose |
|---------|---------|
| `jsonwebtoken` | JWT access & refresh tokens |
| `bcrypt` | Password hashing |
| `express-rate-limit` | API rate limiting |
| `cookie-parser` | Cookie handling |

### File Storage
| Package | Purpose |
|---------|---------|
| `cloudinary` + `multer-storage-cloudinary` | Image upload & CDN |
| `@aws-sdk/client-s3` + `aws-sdk` | AWS S3 file storage |
| `multer` | Multipart form-data handling |
| `streamifier` | Buffer-to-stream conversion |

### Payments
| Package | Purpose |
|---------|---------|
| `stripe` | Registration fee and bundle credit payment processing |

### Real-Time
| Package | Purpose |
|---------|---------|
| `socket.io` | WebSocket real-time chat |
| `ws` | WebSocket server |

### Notifications & Messaging
| Package | Purpose |
|---------|---------|
| `firebase-admin` | FCM push notifications |
| `nodemailer` | Transactional email (OTP, verification, alerts) |

### Utilities
| Package | Purpose |
|---------|---------|
| `zod` | Request schema validation |
| `date-fns` | Date/time manipulation |
| `node-cron` | Scheduled background jobs |
| `morgan` | HTTP request logging |
| `cors` | Cross-origin resource sharing |
| `dotenv` | Environment variable management |
| `uuid` | Unique ID generation |
| `http-status` | HTTP status code constants |

---

## 🗃️ Database Models (Prisma + MongoDB)

```
User                  — Multi-role users with auth, bundle credits, notification preferences
Payment               — Stripe-linked payments per tournament or team registration
Notification          — Per-user in-app & push notifications
Room / Chat           — Real-time direct messaging rooms and messages
Series                — Youth/Adult fee config per tournament stage
Tournament            — Full tournament metadata, game format, fees, and status
TournamentDivision    — Age/gender divisions per tournament with slots & revenue
Teams                 — Coach-owned teams linked to tournaments
TeamManager           — Team ↔ Manager many-to-many assignments
Teamregistration      — Team enrollment into a tournament division with payment
Teamplayer            — Player ↔ Team with waiver status and age verification
Referee               — Referee profiles for match assignment
Match                 — Scheduled games with scores, stage, status, field, and referee
SeriesPointsLedger    — Points per team per tournament with placement tracking
SeriesTeamDiscount    — Per-team percentage discount overrides
ActivityLog           — Per-user audit trail of platform actions
```

---

## ⚙️ Environment Variables

```env
DATABASE_URL=mongodb+srv://...

JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
JWT_ACCESS_EXPIRES_IN=
JWT_REFRESH_EXPIRES_IN=

CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=
AWS_BUCKET_NAME=

STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=

FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=

CLIENT_URL=
PORT=
```

---

## 🚀 Getting Started

```bash
# Clone the repository
git clone https://github.com/Barkat-Ullah/LeagueCore-server-script.git
cd LeagueCore-server-script

# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Set up environment variables
cp .env.example .env

# Start development server
npm run dev

# Build for production
npm run build
npm start
```

---

## 🧩 Tournament Flow

```
Admin Creates Tournament
        ↓
Admin Adds Divisions (U9, U12, HS Boys, Mens Div1 ...)
        ↓
Coach Registers Team → Pays Fee (Stripe / Bundle Credit)
        ↓
Coach Adds Players → Waiver Signing → Age Verification (Admin)
        ↓
Admin Schedules Matches → Assigns Referees → Publishes Schedule
        ↓
Matches Played → Scores Entered
        ↓
Series Points Calculated → Standings Updated
        ↓
Next Stage Unlocked  (Proving → Crown → Royal)
```

---

## 👨‍💻 My Contributions

This is a team project. My personal contributions cover:

- ✅ **Player Dashboard** — Player-facing views: team info, match schedule, waiver signing, standings
- ✅ **Coach Dashboard** — Team creation, roster management, registration payment, bundle credit usage
- ✅ **Referee Management** — Admin CRUD for referee profiles, match-level referee assignment
- ✅ **Player Age Verification** — Admin review flow for verifying/rejecting player age status transitions
- ✅ **Waiver Management** — Player e-waiver signing with name and timestamp, status tracking per player
- ✅ **Bundle Credit System** — Youth/Adult bundle purchasing, credit tracking per coach, usage on registration

---

## 🏅 Divisions Supported

| Category | Divisions |
|----------|-----------|
| **Youth Boys** | U9–U10, U11–U12, U13–U14, U15–U16, U17–U18 |
| **Youth Girls** | U9–U10, U11–U12, U13–U14, U15–U16, U17–U18 |
| **High School** | HS Boys, HS Girls |
| **Adult** | Men's Div 1, Men's Div 2, Men's Div 3, Women's, Co-Ed |

## 📄 License

This project is part of a private team initiative. All rights reserved.

---

<div align="center">
  <sub>Built with ❤️ by the LeagueCore Team</sub>
</div>
