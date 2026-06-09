# SyncSpace — Setup Guide

## Quick Start

### 1. Set Up Supabase Database

1. Create a project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** → **New Query**
3. Paste and run the contents of `database/schema.sql`
4. Go to **Project Settings** → **API** and copy:
   - **Project URL** → `SUPABASE_URL`
   - **anon public** key → `SUPABASE_KEY`
   - **service_role secret** key → `SUPABASE_SERVICE_KEY`

---

### 2. Configure Backend

```bash
cd backend
copy .env.example .env
# Edit .env with your values
```

**.env file:**
```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_KEY=your_anon_key
SUPABASE_SERVICE_KEY=your_service_role_key
JWT_SECRET=any_random_secret_string
SYSTEM_EMAIL=your_syncspace_gmail@gmail.com
FLASK_ENV=development
CORS_ORIGINS=http://localhost:5173
```

**Run backend:**
```bash
# Windows:
..\venv\Scripts\python run.py

# Mac/Linux:
../venv/bin/python run.py
```

Backend runs at http://localhost:5000

---

### 3. Configure Frontend

```bash
cd frontend
copy .env.example .env
```

**.env file:**
```
VITE_API_URL=http://localhost:5000
```

**Run frontend:**
```bash
npm install
npm run dev
```

Frontend runs at http://localhost:5173

---

### 4. First Login

1. Open http://localhost:5173
2. Click **Register**
3. Fill in your details — the **first registered user** automatically becomes an Administrator and is auto-approved
4. You'll be redirected to the dashboard immediately

---

## Google Calendar Integration (Optional)

To enable Google Calendar integration (automatic meeting creation + email invitations):

### Step 1: Create Google Cloud Project
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project → name it "SyncSpace"
3. Enable **Google Calendar API**

### Step 2: Create Service Account
1. Go to **IAM & Admin** → **Service Accounts**
2. Create a new service account
3. Download the JSON key file
4. Rename it to `credentials.json`
5. Place it in the `backend/` folder

### Step 3: Set Up System Gmail Account
1. Create a dedicated Gmail account (e.g., `syncspace@gmail.com`)
2. Go to that Gmail → **Settings** → **See all settings** → **Sharing your calendar**
3. Share your calendar with the service account email (give "Make changes to events" permission)

### Step 4: Enable Domain-Wide Delegation (if using Google Workspace)
- In Google Admin Console → Security → API Controls → Domain-wide delegation
- Add the service account client ID with scope: `https://www.googleapis.com/auth/calendar`

### Step 5: Update .env
```
GOOGLE_CALENDAR_CREDENTIALS_PATH=credentials.json
SYSTEM_EMAIL=your_syncspace_gmail@gmail.com
```

> **Note:** If you skip Google Calendar setup, the app works fully — meetings just won't appear in Google Calendar.

---

## Deployment

### Frontend → Vercel
1. Push the `frontend/` folder to a GitHub repo
2. Connect to Vercel → New Project → Import
3. Set environment variable: `VITE_API_URL=https://your-backend-url.railway.app`
4. Deploy

### Backend → Railway
1. Push the `backend/` folder to a GitHub repo
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Add all environment variables from your `.env` file
4. Set start command: `gunicorn run:app`
5. Deploy

---

## Project Structure

```
SyncSpace2/
├── frontend/          # React + Vite + Tailwind + shadcn/ui
├── backend/           # Flask REST API
├── database/          # SQL schema
├── venv/              # Python virtual environment
└── plan.md            # Architecture plan
```

---

## Features Summary

| Feature | Status |
|---------|--------|
| User Registration & Login | ✅ |
| Admin Approval Workflow | ✅ |
| Calendar (Monthly/Weekly/Daily) | ✅ |
| Meeting Scheduling with Duration | ✅ |
| Attendee Search & Selection | ✅ |
| Conflict Detection | ✅ |
| Suggested Time Slots | ✅ |
| Mark as Busy | ✅ |
| Meeting Responses (Accept/Decline) | ✅ |
| Recurring Meetings | ✅ |
| Notifications Center | ✅ |
| Task Management (Kanban) | ✅ |
| Task Comments & Audit Log | ✅ |
| Manager Team Calendar | ✅ |
| Manager Meeting Stats | ✅ |
| Admin Panel | ✅ |
| Activity Logs | ✅ |
| Google Calendar Integration | ✅ (requires setup) |
| Clickable Meeting Links | ✅ |
