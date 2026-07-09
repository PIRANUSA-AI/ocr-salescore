#!/usr/bin/env bash
# SalesCore VPS Initial Setup Script
# Run once on a fresh Ubuntu/Debian VPS as root or with sudo.
#
# Usage: bash deploy/setup.sh
set -euo pipefail

echo "========================================"
echo "  SalesCore VPS Setup"
echo "========================================"

# ─── 1. System dependencies ───────────────────────────
echo ">>> Updating system packages..."
apt-get update -qq
apt-get install -y -qq curl gnupg ca-certificates nginx certbot python3-certbot-nginx

# ─── 2. Install Node.js 20 LTS ───────────────────────
echo ">>> Installing Node.js 20 LTS..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y -qq nodejs
echo "   Node: $(node -v)"
echo "   npm:  $(npm -v)"

# ─── 3. Install PostgreSQL 16 ────────────────────────
echo ">>> Installing PostgreSQL 16..."
sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /etc/apt/trusted.gpg.d/postgresql.gpg
apt-get update -qq
apt-get install -y -qq postgresql-16
systemctl start postgresql
systemctl enable postgresql

# Create database and user
su - postgres -c "psql -c \"CREATE USER salescore WITH PASSWORD 'salescore_pass';\"" 2>/dev/null || true
su - postgres -c "psql -c \"CREATE DATABASE salescore OWNER salescore;\"" 2>/dev/null || true
su - postgres -c "psql -c \"GRANT ALL PRIVILEGES ON DATABASE salescore TO salescore;\"" 2>/dev/null || true

# ─── 4. Install PM2 ────────────────────────────────────
echo ">>> Installing PM2..."
npm install -g pm2

# ─── 5. Create app directory and log directory ────────
echo ">>> Creating directories..."
mkdir -p /opt/salescore
mkdir -p /var/log/salescore
chmod 755 /var/log/salescore

# ─── 6. Clone/deploy the app (manual step) ─────────────
echo ""
echo "========================================"
echo "  Setup Complete!"
echo "========================================"
echo ""
echo "Next steps:"
echo "  1. Clone the repo to /opt/salescore:"
echo "     git clone <your-repo-url> /opt/salescore"
echo ""
echo "  2. Copy your .env file:"
echo "     cp /opt/salescore/apps/backend/.env.production /opt/salescore/apps/backend/.env"
echo ""
echo "  3. Install dependencies and build:"
echo "     cd /opt/salescore && npm ci"
echo "     npm run build"
echo "     cd apps/backend && npm run build"
echo ""
echo "  4. Run database migrations:"
echo "     psql -h 127.0.0.1 -U salescore -d salescore < apps/backend/db/001_initial.sql"
echo ""
echo "  5. Start with PM2:"
echo "     pm2 start deploy/ecosystem.config.cjs"
echo "     pm2 save"
echo "     pm2 startup"
echo ""
echo "  6. Configure nginx:"
echo "     cp deploy/nginx.conf /etc/nginx/sites-available/salescore"
echo "     # Update server_name in the config"
echo "     ln -s /etc/nginx/sites-available/salescore /etc/nginx/sites-enabled/"
echo "     rm -f /etc/nginx/sites-enabled/default"
echo "     nginx -t && systemctl reload nginx"
echo ""
echo "  7. Set up SSL (optional):"
echo "     certbot --nginx -d your-domain.com"
