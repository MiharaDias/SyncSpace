# SyncSpace — Complete Hosting Guide
### Deploy on Ubuntu with Docker & Cloudflare Tunnel (Beginner Friendly)

---

## Table of Contents

1. [What This Guide Does](#1-what-this-guide-does)
2. [What You Need Before Starting](#2-what-you-need-before-starting)
3. [Part 1 — Push Your Project to GitHub](#part-1--push-your-project-to-github)
4. [Part 2 — Get an Ubuntu Server](#part-2--get-an-ubuntu-server)
5. [Part 3 — Connect to Your Server](#part-3--connect-to-your-server)
6. [Part 4 — Install Docker on Ubuntu](#part-4--install-docker-on-ubuntu)
7. [Part 5 — Create Docker Files](#part-5--create-docker-files)
8. [Part 6 — Set Up Environment Variables](#part-6--set-up-environment-variables)
9. [Part 7 — Build and Run the App](#part-7--build-and-run-the-app)
10. [Part 8 — Set Up Cloudflare Tunnel](#part-8--set-up-cloudflare-tunnel)
11. [Part 9 — Update Google OAuth Settings](#part-9--update-google-oauth-settings)
12. [Part 10 — Maintenance & Updates](#part-10--maintenance--updates)
13. [Troubleshooting](#troubleshooting)

---

## 1. What This Guide Does

By the end of this guide, SyncSpace will be:

- Running 24/7 on a cloud server (you can close your laptop and it stays online)
- Accessible at a real URL like `https://syncspace.yourcompany.com`
- Secured with HTTPS automatically (via Cloudflare)
- Easy to update (just run two commands)

**How it works:**

```
Your users
    ↓  (HTTPS)
Cloudflare Tunnel  ← free, handles HTTPS for you
    ↓  (HTTP internally, secure)
Your Ubuntu Server
    ↓
Docker containers
  ├── Frontend (React app served by Nginx)   — port 3000
  └── Backend  (Flask API via Gunicorn)      — internal only
```

---

## 2. What You Need Before Starting

| Item | Cost | Where to get it |
|------|------|-----------------|
| GitHub account | Free | [github.com](https://github.com) |
| Ubuntu server (VPS) | ~$6/month | DigitalOcean, Hetzner, Vultr (see Part 2) |
| Cloudflare account | Free | [cloudflare.com](https://cloudflare.com) |
| A domain name | ~$10/year | Namecheap, Cloudflare, GoDaddy |
| Git installed on your computer | Free | [git-scm.com](https://git-scm.com) |

> **No domain?** You can test with Cloudflare's free temporary URLs first.  
> A domain is required for permanent use.

---

## Part 1 — Push Your Project to GitHub

We push to GitHub so the server can download the code easily.  
**The server never needs a USB drive or file transfer.**

---

### Step 1.1 — Install Git on Your Computer

**Windows:**
1. Go to [git-scm.com/download/win](https://git-scm.com/download/win)
2. Download and install (click Next through everything — defaults are fine)
3. Open **Git Bash** (search for it in Start menu) — use this for all git commands

**Mac:**
Open Terminal and run:
```bash
xcode-select --install
```

**Verify it worked:**
```bash
git --version
# Should show: git version 2.x.x
```

---

### Step 1.2 — Create a GitHub Account & Repository

1. Go to [github.com](https://github.com) and sign up (free)
2. After logging in, click the **+** button in the top-right corner → **New repository**
3. Fill in:
   - **Repository name:** `syncspace` (or anything you like)
   - **Visibility:** Select **Private** ← important! Your code contains config files
   - Leave everything else as default
4. Click **Create repository**
5. GitHub will show you a page with setup instructions — **leave this page open**, you'll need the URL

---

### Step 1.3 — Protect Sensitive Files Before Pushing

**This is critical.** We must make sure your database passwords and API keys are never pushed to GitHub.

Open **Git Bash** (Windows) or **Terminal** (Mac/Linux) and navigate to your project folder:

```bash
# Replace this path with your actual project location
cd /c/Users/mail2/PycharmProjects/SyncSpace2
```

Create a root-level `.gitignore` file:

```bash
cat > .gitignore << 'EOF'
# ── Sensitive files — NEVER commit these ──────────────────────────────────────
backend/.env
backend/.env.production
backend/credentials.json
backend/venv/
backend/.venv/

# ── Build artifacts ───────────────────────────────────────────────────────────
frontend/node_modules/
frontend/dist/
frontend/.env.local
frontend/.env.production.local

# ── Python cache ──────────────────────────────────────────────────────────────
__pycache__/
*.pyc
*.pyo
*.pyd
.Python

# ── OS files ──────────────────────────────────────────────────────────────────
.DS_Store
Thumbs.db
*.log
EOF
```

**Verify the .env will NOT be committed:**
```bash
git check-ignore -v backend/.env
# Should show: .gitignore:2:backend/.env  backend/.env
# If it shows nothing, the file is NOT ignored — double-check the .gitignore above
```

---

### Step 1.4 — Push Your Code to GitHub

```bash
# 1. Initialize git in your project (only needed once)
git init

# 2. Stage all files (the .gitignore above will automatically exclude sensitive files)
git add .

# 3. Check what will be committed — make sure .env is NOT in this list
git status
# Look through the list. If you see "backend/.env" — stop and re-check Step 1.3

# 4. Create your first commit
git commit -m "Initial commit"

# 5. Connect to your GitHub repository
#    Replace YOUR_USERNAME and YOUR_REPO_NAME with your actual values
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git

# 6. Push to GitHub
git branch -M main
git push -u origin main
```

When prompted for username and password:
- Username: your GitHub username
- Password: use a **Personal Access Token** (not your GitHub password)
  - Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token
  - Select scope: `repo` → Generate → Copy the token
  - Paste it as the password

**Verify:** Go to your GitHub repository URL in your browser — you should see your project files.  
**Make sure** `backend/.env` is **not** visible in the file list.

---

## Part 2 — Get an Ubuntu Server

---

### Step 2.1 — Choose a Provider

We recommend **Hetzner** (cheapest, great quality) or **DigitalOcean** (most beginner-friendly):

| Provider | Cheapest Plan | Monthly Cost |
|----------|--------------|--------------|
| [Hetzner](https://hetzner.com/cloud) | CX22 (2 vCPU, 4 GB RAM) | ~€4/month |
| [DigitalOcean](https://digitalocean.com) | Basic Droplet (1 vCPU, 1 GB RAM) | $6/month |
| [Vultr](https://vultr.com) | Cloud Compute (1 vCPU, 1 GB RAM) | $6/month |

**Minimum recommended:** 1 vCPU, 2 GB RAM (1 GB might be tight during Docker builds)

---

### Step 2.2 — Create the Server (DigitalOcean example)

1. Sign up at [digitalocean.com](https://digitalocean.com)
2. Click **Create** → **Droplets**
3. Choose:
   - **Region:** Pick the one closest to your users
   - **OS:** Ubuntu 24.04 (LTS)
   - **Size:** Basic → Regular → $6/month (1 GB RAM) or $12/month (2 GB RAM, recommended)
   - **Authentication:** SSH Key (more secure) or Password
     - For beginners: choose **Password**, set a strong password
4. Click **Create Droplet**
5. Wait 1-2 minutes — you'll get an **IP address** like `134.209.xxx.xxx`
6. **Write down this IP address** — you'll need it constantly

---

## Part 3 — Connect to Your Server

---

### Step 3.1 — Connect via SSH

SSH lets you control your server by typing commands from your computer.

**Windows (using built-in Terminal or PowerShell):**
```
ssh root@YOUR_SERVER_IP
```
Example: `ssh root@134.209.123.456`

**Mac / Linux:**
Open Terminal and run the same command:
```bash
ssh root@YOUR_SERVER_IP
```

When asked `Are you sure you want to continue connecting?` → type `yes` and press Enter  
Enter your server password when prompted (the one you set in Step 2.2)

You should now see something like:
```
root@ubuntu-server:~#
```
This means you are now controlling your server. 🎉

---

### Step 3.2 — First-Time Server Setup

Run these commands to update the server and create a safer user:

```bash
# Update all software on the server
apt update && apt upgrade -y

# Install some useful tools
apt install -y curl wget git nano unzip

# Confirm the server is ready
echo "Server is ready!"
```

---

## Part 4 — Install Docker on Ubuntu

Docker lets us run SyncSpace in isolated containers — no messy dependency conflicts.

---

### Step 4.1 — Install Docker

Run these commands on your server (copy-paste each block):

```bash
# Remove any old versions of Docker (safe to run even if Docker was never installed)
apt remove -y docker docker-engine docker.io containerd runc 2>/dev/null; true

# Install required tools
apt install -y ca-certificates curl gnupg lsb-release

# Add Docker's official signing key
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

# Add Docker's repository to apt
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

---

### Step 4.2 — Verify Docker is Working

```bash
docker --version
# Should show: Docker version 26.x.x, build xxxxx

docker compose version
# Should show: Docker Compose version v2.x.x
```

---

### Step 4.3 — Make Docker Start Automatically on Boot

```bash
systemctl enable docker
systemctl start docker
echo "Docker is running!"
```

---

## Part 5 — Create Docker Files

We need to create four files that tell Docker how to build and run the app.  
**Do this on your computer** (not the server), then push to GitHub.

---

### Step 5.1 — Backend Dockerfile

Create the file `backend/Dockerfile` with this content:

```dockerfile
# Use Python 3.11
FROM python:3.11-slim

# Install system packages needed for some Python libraries
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Set working directory inside the container
WORKDIR /app

# Copy and install Python dependencies first
# (Docker caches this layer — faster rebuilds if only your code changes)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the backend code
COPY . .

# Tell Docker which port Flask uses
EXPOSE 5000

# Run the app with Gunicorn (production-grade web server)
# 2 workers handles multiple users simultaneously
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "--timeout", "120", "run:app"]
```

---

### Step 5.2 — Frontend Dockerfile

Create the file `frontend/Dockerfile` with this content:

```dockerfile
# ── Stage 1: Build the React app ─────────────────────────────────────────────
FROM node:18-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build the production app
# VITE_API_URL is empty so API calls go through nginx proxy (same origin)
RUN VITE_API_URL="" npm run build

# ── Stage 2: Serve with Nginx ─────────────────────────────────────────────────
FROM nginx:alpine

# Copy the built app from Stage 1
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy our nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

---

### Step 5.3 — Nginx Configuration

Create the file `frontend/nginx.conf`:

```nginx
server {
    listen 80;
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    # Enable gzip compression for faster loading
    gzip on;
    gzip_types text/plain text/css application/json application/javascript
               text/xml application/xml text/javascript;

    # React Router — any URL that doesn't match a file goes to index.html
    # This is required for client-side routing to work
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Forward all /api/ requests to the Flask backend container
    # "backend" is the service name in docker-compose.yml
    location /api/ {
        proxy_pass http://backend:5000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        proxy_connect_timeout 10s;
    }

    # Cache static files (images, fonts, JS, CSS) for 1 year
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

---

### Step 5.4 — Docker Compose File

Create the file `docker-compose.yml` **in the root of your project** (same level as `frontend/` and `backend/`):

```yaml
version: '3.8'

services:

  # ── Flask backend ─────────────────────────────────────────────────────────
  backend:
    build: ./backend
    container_name: syncspace-backend
    env_file: ./backend/.env.production     # environment variables (Step 6)
    volumes:
      # Mount credentials.json for Google Calendar (read-only)
      - ./backend/credentials.json:/app/credentials.json:ro
    restart: unless-stopped                  # auto-restart if it crashes
    networks:
      - syncspace-net
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5000/api/auth/departments"]
      interval: 30s
      timeout: 10s
      retries: 3

  # ── React frontend (Nginx) ────────────────────────────────────────────────
  frontend:
    build: ./frontend
    container_name: syncspace-frontend
    ports:
      - "3000:80"     # server port 3000 → nginx port 80 inside container
    depends_on:
      - backend
    restart: unless-stopped
    networks:
      - syncspace-net

# Both containers talk to each other through this internal network
# The backend is NOT exposed to the internet — only the frontend is
networks:
  syncspace-net:
    driver: bridge
```

---

### Step 5.5 — Push the New Files to GitHub

Back in Git Bash / Terminal on your **computer**:

```bash
cd /c/Users/mail2/PycharmProjects/SyncSpace2

git add backend/Dockerfile frontend/Dockerfile frontend/nginx.conf docker-compose.yml

git commit -m "Add Docker configuration for production deployment"

git push
```

---

## Part 6 — Set Up Environment Variables

The server needs your Supabase keys, Google OAuth credentials, etc.  
**We do NOT put these in GitHub** — we create them directly on the server.

---

### Step 6.1 — Create the Production .env on the Server

Go back to your **server terminal** (SSH session) and run:

```bash
# Create the project directory on the server
mkdir -p /opt/syncspace
cd /opt/syncspace

# Clone your GitHub repository
git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git .
# Enter your GitHub username and Personal Access Token when prompted
```

Now create the backend production environment file:

```bash
nano backend/.env.production
```

This opens a text editor. Type in your settings — **replace everything in `< >` with your actual values**:

```env
# ── Flask settings ─────────────────────────────────────────────────────────
FLASK_ENV=production
JWT_SECRET=YOUR_JWT_SECRET_FROM_LOCAL_ENV

# ── Supabase ────────────────────────────────────────────────────────────────
SUPABASE_URL=YOUR_SUPABASE_URL
SUPABASE_KEY=YOUR_SUPABASE_KEY
SUPABASE_SERVICE_KEY=YOUR_SUPABASE_SERVICE_KEY

# ── Google OAuth (from Google Cloud Console) ────────────────────────────────
GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET=YOUR_GOOGLE_CLIENT_SECRET

# ── IMPORTANT: Replace yourdomain.com with your actual domain ───────────────
GOOGLE_REDIRECT_URI=https://yourdomain.com/api/auth/google/callback
GOOGLE_SIGNIN_REDIRECT_URI=https://yourdomain.com/api/auth/google/signin-callback
FRONTEND_URL=https://yourdomain.com

# ── CORS — allow requests from your domain ──────────────────────────────────
CORS_ORIGINS=https://yourdomain.com

# ── Google Calendar service account ─────────────────────────────────────────
GOOGLE_CALENDAR_CREDENTIALS_PATH=./credentials.json
SYSTEM_EMAIL=your_system_email@gmail.com
```

**Save and exit nano:**
- Press `Ctrl + X`
- Press `Y` to confirm saving
- Press `Enter`

---

### Step 6.2 — Upload credentials.json to the Server

The `credentials.json` file (Google Calendar service account) is on your computer.  
We need to get it onto the server without putting it in GitHub.

**On your computer** (not the server), open a **new** Git Bash / Terminal window:

```bash
# Replace the path and IP with your actual values
scp /c/Users/mail2/PycharmProjects/SyncSpace2/backend/credentials.json \
    root@YOUR_SERVER_IP:/opt/syncspace/backend/credentials.json
```

When prompted, enter your server password.

**Back on the server**, verify it arrived:
```bash
ls -la /opt/syncspace/backend/credentials.json
# Should show the file with a file size
```

---

## Part 7 — Build and Run the App

---

### Step 7.1 — Build the Docker Containers

On your **server** (SSH session):

```bash
cd /opt/syncspace

# Build and start everything
# This downloads base images and compiles your app — takes 3-10 minutes the first time
docker compose up --build -d
```

What `--build` means: rebuild the images from scratch  
What `-d` means: run in the background (detached mode)

**Watch the build progress:**
```bash
docker compose logs -f
```
Press `Ctrl + C` to stop watching logs (the app keeps running).

---

### Step 7.2 — Check Everything is Running

```bash
docker compose ps
```

You should see something like:
```
NAME                   STATUS         PORTS
syncspace-backend      Up (healthy)
syncspace-frontend     Up             0.0.0.0:3000->80/tcp
```

Both should say **Up**. If something says **Exit**, check logs:
```bash
docker compose logs backend
docker compose logs frontend
```

---

### Step 7.3 — Quick Test

The app is now running on port 3000. Test it from the server itself:

```bash
curl http://localhost:3000
# Should return HTML (the React app)

curl http://localhost:3000/api/auth/departments
# Should return a JSON list of departments
```

If both return data, the app is working! 🎉  
It's not yet accessible from the internet — that's what the Cloudflare Tunnel is for.

---

## Part 8 — Set Up Cloudflare Tunnel

Cloudflare Tunnel creates a secure encrypted connection between your server and Cloudflare's network. This means:
- No need to open firewall ports
- HTTPS is handled automatically (free)
- Your server's real IP stays hidden

---

### Step 8.1 — Create a Cloudflare Account and Add Your Domain

1. Go to [cloudflare.com](https://cloudflare.com) and create a free account
2. Click **Add a site** and enter your domain name
3. Select the **Free** plan
4. Cloudflare will show you two **nameservers** (like `ali.ns.cloudflare.com`)
5. Log in to your domain registrar (Namecheap, GoDaddy, etc.)
6. Find **DNS / Nameservers settings** for your domain
7. Replace the existing nameservers with the two Cloudflare ones
8. Click Save — changes can take up to 24 hours but usually take 5-30 minutes

> **Don't have a domain yet?** Skip to Step 8.3 and use `--url localhost:3000` for a free temporary URL to test, then come back and set up a real domain later.

---

### Step 8.2 — Install cloudflared on the Server

On your **server** (SSH session):

```bash
# Download the cloudflared binary
curl -L --output cloudflared.deb \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb

# Install it
dpkg -i cloudflared.deb

# Verify installation
cloudflared --version
# Should show: cloudflared version 20xx.x.x
```

---

### Step 8.3 — Create the Tunnel

```bash
# Log in to Cloudflare (this opens a URL — copy it and open in your browser)
cloudflared tunnel login
```

You'll see a long URL starting with `https://dash.cloudflare.com/...`  
Open that URL in your browser → select your domain → click Authorize

Back on the server:
```bash
# Create a new tunnel named "syncspace"
cloudflared tunnel create syncspace
```

You'll see output like:
```
Tunnel credentials written to /root/.cloudflared/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.json
Created tunnel syncspace with id xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

**Write down the tunnel ID** (the long string of letters and numbers).

---

### Step 8.4 — Configure the Tunnel

Create the tunnel configuration file:

```bash
nano ~/.cloudflared/config.yml
```

Paste this content — **replace the placeholders with your actual values:**

```yaml
# Replace with your tunnel ID from Step 8.3
tunnel: YOUR_TUNNEL_ID_HERE

# Replace with your tunnel ID in the filename below
credentials-file: /root/.cloudflared/YOUR_TUNNEL_ID_HERE.json

ingress:
  # Route your domain to the frontend (which proxies API calls to backend)
  - hostname: yourdomain.com
    service: http://localhost:3000

  # Also route www subdomain (optional)
  - hostname: www.yourdomain.com
    service: http://localhost:3000

  # Required catch-all rule
  - service: http_status:404
```

Save and exit: `Ctrl + X`, then `Y`, then `Enter`

---

### Step 8.5 — Create DNS Records in Cloudflare

```bash
# This automatically creates the DNS record pointing your domain to the tunnel
cloudflared tunnel route dns syncspace yourdomain.com

# Also for www (optional)
cloudflared tunnel route dns syncspace www.yourdomain.com
```

You should see: `Added CNAME yourdomain.com which will route to this tunnel`

---

### Step 8.6 — Start the Tunnel as a Service (Auto-start on Boot)

```bash
# Install cloudflared as a system service
cloudflared service install

# Start it now
systemctl start cloudflared

# Enable auto-start on server reboot
systemctl enable cloudflared

# Check it's running
systemctl status cloudflared
```

You should see `Active: active (running)` in green. ✅

---

### Step 8.7 — Test Your Domain

Open a browser and go to `https://yourdomain.com`

You should see the SyncSpace login page! 🎉

> **If it doesn't work yet:** DNS changes can take up to 30 minutes. Wait a bit and try again.  
> Check tunnel status: `cloudflared tunnel info syncspace`

---

## Part 9 — Update Google OAuth Settings

When you created Google OAuth credentials, they only allowed `localhost`.  
Now we need to add your real domain.

---

### Step 9.1 — Update Google Cloud Console

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Select your project
3. Go to **APIs & Services** → **Credentials**
4. Click on your OAuth 2.0 Client ID
5. Under **Authorized redirect URIs**, click **Add URI** and add ALL of these:
   ```
   https://yourdomain.com/api/auth/google/callback
   https://yourdomain.com/api/auth/google/signin-callback
   ```
6. Under **Authorized JavaScript origins**, add:
   ```
   https://yourdomain.com
   ```
7. Click **Save**

---

### Step 9.2 — Restart the Backend to Apply Changes

On the server:
```bash
cd /opt/syncspace
docker compose restart backend
```

Google sign-in should now work on your live domain.

---

## Part 10 — Maintenance & Updates

---

### How to Update SyncSpace (When You Push New Code)

Whenever you make changes to the code and push to GitHub, run these commands on the server:

```bash
cd /opt/syncspace

# Pull the latest code from GitHub
git pull

# Rebuild and restart the containers
docker compose up --build -d

# Watch the startup logs
docker compose logs -f
# Press Ctrl+C when you see everything is running
```

> The update takes 2-5 minutes. The app will be briefly offline during rebuild.

---

### How to View Logs

```bash
cd /opt/syncspace

# View all logs (both containers)
docker compose logs

# View live logs (keeps updating — press Ctrl+C to stop)
docker compose logs -f

# View only backend logs
docker compose logs backend

# View only frontend logs
docker compose logs frontend

# View last 100 lines
docker compose logs --tail=100
```

---

### How to Restart the App

```bash
cd /opt/syncspace

# Restart everything
docker compose restart

# Restart only the backend
docker compose restart backend

# Stop everything
docker compose down

# Start everything again
docker compose up -d
```

---

### How to Check Server Resource Usage

```bash
# See running containers and resource usage
docker stats

# See disk space
df -h

# See RAM usage
free -h

# See CPU usage
htop   # press Q to quit
```

---

### Automatic Restart on Server Reboot

Both Docker (configured in Step 4.3) and each container (configured with `restart: unless-stopped` in docker-compose.yml) will automatically restart after a server reboot.

To test: `reboot` — wait 2 minutes — visit your domain — it should be back.

---

### How to Update Your Domain's Frontend URL

If you change domains, update the backend .env.production file:

```bash
cd /opt/syncspace
nano backend/.env.production
# Update FRONTEND_URL, CORS_ORIGINS, and the two GOOGLE_*_REDIRECT_URI values

# Restart the backend to apply changes
docker compose restart backend
```

---

## Troubleshooting

### "502 Bad Gateway" in browser
The frontend can't reach the backend.
```bash
docker compose ps          # check both containers are "Up"
docker compose logs backend  # look for Python errors
```

### "Connection refused" on the domain
The Cloudflare tunnel isn't running or the app isn't on port 3000.
```bash
systemctl status cloudflared    # check tunnel is running
docker compose ps               # check frontend is on port 3000
curl http://localhost:3000      # test the app directly
```

### Backend container keeps restarting
There's a startup error — usually a missing environment variable.
```bash
docker compose logs backend --tail=50
# Look for error messages like "KeyError: 'SUPABASE_URL'" or similar
# Then check your backend/.env.production file
nano backend/.env.production
```

### "Google sign-in not working" on live site
You forgot to add the redirect URIs in Google Cloud Console.  
Go back to [Part 9](#part-9--update-google-oauth-settings).

### Git pull asks for username/password every time
Set up credential caching on the server:
```bash
git config --global credential.helper store
git pull   # enter credentials once — they'll be saved
```

### The app runs fine but emails still fail
Make sure `FRONTEND_URL` in backend/.env.production is your real domain, then:
```bash
docker compose restart backend
```
Then go to Admin Panel → Settings → save email config again → test.

### Need to completely start over
```bash
cd /opt/syncspace
docker compose down --volumes --rmi all  # removes everything
git pull                                  # get fresh code
docker compose up --build -d             # rebuild from scratch
```

---

## Quick Reference Card

| Task | Command |
|------|---------|
| SSH into server | `ssh root@YOUR_SERVER_IP` |
| Go to project folder | `cd /opt/syncspace` |
| Start the app | `docker compose up -d` |
| Stop the app | `docker compose down` |
| Restart everything | `docker compose restart` |
| View logs | `docker compose logs -f` |
| Update from GitHub | `git pull && docker compose up --build -d` |
| Check container status | `docker compose ps` |
| Check tunnel status | `systemctl status cloudflared` |
| Restart tunnel | `systemctl restart cloudflared` |
| Edit production .env | `nano /opt/syncspace/backend/.env.production` |

---

*Made with ❤️ for SyncSpace — if something breaks, check the logs first: `docker compose logs -f`*
