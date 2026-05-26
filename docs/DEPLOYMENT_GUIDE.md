# Vijayanth Prototype — Deployment Guide

**Stack:** Vite + React TSX (frontend) · Node.js + Express + SQLite (backend)  
**Hosting:** Vercel (frontend) + Render (backend)  
**Repository:** Private GitHub repo — both platforms support private repos via OAuth

---

## Private Repository — Quick Answer

**Yes, private repos work on both platforms.** During setup, each platform asks you to connect your GitHub (or GitLab/Bitbucket) account via OAuth. You grant access to specific private repositories only — you never need to make the repo public.

---

## Architecture Overview

```
Browser
  └── Vercel CDN  (frontend — Vite build, static files)
        └── fetch /api/*
              └── Render Web Service  (Express API, port 3001)
                    └── SQLite file  (local disk on Render)
```

---

## Prerequisites

Before starting:
- GitHub account with the private repo pushed
- Vercel account — [vercel.com](https://vercel.com) (free hobby plan is sufficient)
- Render account — [render.com](https://render.com) (free tier is sufficient for demo)

---

## Step 1 — One-time code change before deployment

The frontend API base URL is currently hardcoded to `http://localhost:3001/api`. This must read from an environment variable in production.

Open `frontend/src/lib/api.ts` and change the base URL line to:

```ts
const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api';
```

Commit and push this change before proceeding.

---

## Step 2 — Deploy the Backend on Render

### 2a. Create a new Web Service

1. Log in to [render.com](https://render.com)
2. Click **New +** → **Web Service**
3. Click **Connect a repository** → **Connect GitHub**
4. Authorise Render to access your GitHub account
5. When prompted, choose **Only select repositories** and pick the private vijayanth repo
6. Click the repo name to select it → **Connect**

### 2b. Configure the Web Service

Fill in these fields on the configuration screen:

| Field | Value |
|---|---|
| **Name** | `vijayanth-api` |
| **Region** | Singapore (closest to India) |
| **Branch** | `demo-dev` (or `main` when ready) |
| **Root Directory** | *(leave blank)* |
| **Runtime** | Node |
| **Build Command** | `npm install && cd backend && npm install && npm run build` |
| **Start Command** | `node backend/dist/index.js` |
| **Instance Type** | Free |

### 2c. Add Environment Variables

On the same page, scroll to **Environment Variables** and add:

| Key | Value |
|---|---|
| `DATABASE_URL` | `file:./prisma/dev.db` |
| `SESSION_SECRET` | *(generate a random string — see note below)* |
| `FRONTEND_URL` | *(leave blank for now — fill after Vercel is deployed)* |
| `PORT` | `3001` |
| `NODE_ENV` | `production` |

> **Generating a SESSION_SECRET:** Run `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` in your terminal. Paste the output as the value.

### 2d. Deploy

Click **Create Web Service**. Render will:
1. Clone the repo
2. Run the build command
3. Start the server

First deploy takes 3–5 minutes. When the status shows **Live**, note your service URL — it will look like:
```
https://vijayanth-api.onrender.com
```

### 2e. Seed the database

After the first successful deploy, open the **Shell** tab in the Render dashboard and run:

```bash
npx prisma db push && npm run db:seed
```

This creates all database tables and loads all seed data (5 users, projects, WBS, vendors, POs, payments, etc.).

> **Important:** Render's free tier uses an ephemeral filesystem. Data will reset whenever the service is redeployed or restarts after inactivity. For a stable demo, add a Persistent Disk (see Section 5).

---

## Step 3 — Deploy the Frontend on Vercel

### 3a. Create a new Project

1. Log in to [vercel.com](https://vercel.com)
2. Click **Add New** → **Project**
3. Click **Import Git Repository** → **Connect GitHub**
4. Authorise Vercel to access your GitHub account
5. Choose **Only select repositories** → select the private vijayanth repo
6. Click **Import**

### 3b. Configure the Project

On the configuration screen:

| Field | Value |
|---|---|
| **Framework Preset** | Vite |
| **Root Directory** | `frontend` |
| **Build Command** | `npm run build` *(auto-detected)* |
| **Output Directory** | `dist` *(auto-detected)* |
| **Install Command** | `npm install` *(auto-detected)* |

### 3c. Add Environment Variable

Under **Environment Variables**, add:

| Key | Value |
|---|---|
| `VITE_API_URL` | `https://vijayanth-api.onrender.com/api` |

Replace the URL with your actual Render service URL from Step 2d.

### 3d. Deploy

Click **Deploy**. Vercel builds and deploys in 1–2 minutes. Your frontend URL will look like:
```
https://vijayanth-group.vercel.app
```

---

## Step 4 — Wire the two services together

### 4a. Update CORS origin on Render

Go to your Render Web Service → **Environment** tab → edit `FRONTEND_URL`:

```
https://vijayanth-group.vercel.app
```

Click **Save Changes**. Render will redeploy automatically.

### 4b. Re-seed after the redeploy

After the automatic redeploy completes, go to the Render **Shell** tab and re-run:

```bash
npm run db:seed
```

*(The redeploy clears the database on the free tier ephemeral filesystem.)*

---

## Step 5 — Persistent Data (Recommended for Demo)

Without a persistent disk, **all data resets on every Render redeploy or service restart**. For a client demo you need data to survive across sessions.

### Option A — Render Persistent Disk (~$1/month)

1. Render dashboard → your Web Service → **Disks** tab
2. Click **Add Disk**
3. Set **Mount Path** to `/data`, size `1 GB`
4. Update the `DATABASE_URL` environment variable to:
   ```
   file:/data/dev.db
   ```
5. Redeploy → seed once → data will now persist permanently

### Option B — Migrate to Render PostgreSQL (free)

If you want fully free persistent storage, migrate from SQLite to PostgreSQL:

1. Render dashboard → **New +** → **PostgreSQL** → create a free database
2. Copy the **Internal Database URL** from the Render PostgreSQL dashboard
3. In `prisma/schema.prisma`, change the datasource:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
4. Update `DATABASE_URL` on the Web Service to the PostgreSQL connection string
5. Redeploy → run `npx prisma migrate deploy && npm run db:seed` in the Render shell

---

## Step 6 — Post-Deployment Verification

Run through this checklist after both services are live:

- [ ] Backend health: open `https://vijayanth-api.onrender.com/api/health` — should return `{"ok":true}`
- [ ] Frontend loads: open your Vercel URL — login page appears with Forest Green background
- [ ] Login works: sign in with `suresh@vijayanth.in` / `demo123` → Project Head dashboard loads
- [ ] Role switcher: switch to Sector Head → dashboard updates instantly
- [ ] WBS figures load: navigate to Usilampatti 1 MW → Budget/WBS tab → ₹5,41,78,638 total
- [ ] Excel export: Reports page → Export Project P&L → `.xlsx` file downloads

---

## Step 7 — Resetting Demo Data Before a Client Presentation

**Option 1 — From the app UI (Super Admin):**  
Log in as `admin@vijayanth.in` → Settings → Reset Demo Data

**Option 2 — From Render shell:**
```bash
npm run db:reset
```

---

## Environment Variables Reference

### Backend (Render)

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | Prisma database connection | `file:./prisma/dev.db` or `file:/data/dev.db` |
| `SESSION_SECRET` | Express session signing key | 64-char hex string |
| `FRONTEND_URL` | Allowed CORS origin | `https://vijayanth-group.vercel.app` |
| `PORT` | API server port | `3001` |
| `NODE_ENV` | Node environment | `production` |

### Frontend (Vercel)

| Variable | Description | Example |
|---|---|---|
| `VITE_API_URL` | Backend API base URL | `https://vijayanth-api.onrender.com/api` |

---

## Costs

| Service | Plan | Cost |
|---|---|---|
| Vercel | Hobby (free) | $0/month |
| Render Web Service | Free tier | $0/month |
| Render Persistent Disk | 1 GB | ~$1/month |
| Render PostgreSQL | Free tier | $0/month |

**Total for demo: $0–1/month**

> **Render free tier note:** The free Web Service spins down after 15 minutes of inactivity. The first request after spin-down takes ~30 seconds to respond. Warn the client before the demo or upgrade to the Starter plan ($7/month) to keep it always-on.

---

## Redeployment (Future Updates)

Both platforms redeploy automatically on every push to the connected branch:

- **Vercel** — rebuilds and deploys the frontend within ~60 seconds of a push
- **Render** — rebuilds and restarts the backend within ~3 minutes of a push

To deploy a specific branch or trigger manually, use the **Manual Deploy** button in each platform's dashboard.

---

## Demo Credentials

| Email | Password | Role | Scope |
|---|---|---|---|
| `admin@vijayanth.in` | `demo123` | Super Admin | All sectors, all projects |
| `corporate@vijayanth.in` | `demo123` | Corporate Office | All sectors, all projects |
| `solar.head@vijayanth.in` | `demo123` | Sector Head | Solar sector |
| `suresh@vijayanth.in` | `demo123` | Project Head | Usilampatti 1 MW |
| `kavi@vijayanth.in` | `demo123` | Project Head | Usilampatti 4 MW |
