# VPS deployment templates

This directory contains templates to help deploy the app on a VPS with Docker and Nginx.

## Nginx

Templates:
- `deploy/nginx/burcev.team.conf` → reverse proxy to `127.0.0.1:3069` (production)
- `deploy/nginx/beta.burcev.team.conf` → reverse proxy to `127.0.0.1:3070` (staging)

Typical installation on the VPS (example):
- Copy to `/etc/nginx/sites-available/`
- Symlink into `/etc/nginx/sites-enabled/`
- `nginx -t && systemctl reload nginx`

Certs are assumed to be managed by certbot/Let’s Encrypt.

## Environment files

Templates:
- `deploy/env/.env.production.example` → copy to `${DEPLOY_PATH}/.env.production`
- `deploy/env/.env.staging.example` → copy to `${DEPLOY_PATH}/.env.staging`

These files are consumed by the CD pipeline when it runs `docker run --env-file ...` on the VPS.

IMPORTANT: keep real `.env.production` / `.env.staging` out of git.
