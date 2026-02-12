# Deploy `dev` Branch to `new.burcev.team` Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Configure the `dev` branch CD pipeline to deploy the app to `new.burcev.team` so it's publicly accessible.

**Architecture:** The existing CD pipeline already builds and deploys the `dev` branch to `dev.burcev.team` via SSH to a VDS server (Docker container on port 3071, proxied by nginx). We rename the domain from `dev.burcev.team` to `new.burcev.team` in the pipeline, then configure the server side (nginx, DNS, SSL).

**Tech Stack:** GitHub Actions, Docker, nginx, certbot, DNS

---

## Current State

| Branch    | Domain               | Container         | Host Port |
|-----------|----------------------|-------------------|-----------|
| `main`    | `burcev.team`        | `burcev-production` | 3069    |
| `develop` | `beta.burcev.team`   | `burcev-staging`    | 3070    |
| `dev`     | `dev.burcev.team`    | `burcev-dev`        | 3071    |

**Target:** Change `dev` deployment domain from `dev.burcev.team` to `new.burcev.team`. Container name and port stay the same.

---

### Task 1: Update CD Pipeline Domain References

**Files:**
- Modify: `.github/workflows/cd.yml` (lines 185, 194, 199, 719)

**Step 1: Replace `dev.burcev.team` with `new.burcev.team` in cd.yml**

In the `deploy-dev` job, change all occurrences of `dev.burcev.team` to `new.burcev.team`:

1. Line 185 — deployment_url output:
```yaml
# Before:
echo "deployment_url=https://dev.burcev.team" >> "$GITHUB_OUTPUT"
# After:
echo "deployment_url=https://new.burcev.team" >> "$GITHUB_OUTPUT"
```

2. Line 194 — health check URL:
```yaml
# Before:
if curl -fsS "https://dev.burcev.team/api/health" >/dev/null 2>&1; then
# After:
if curl -fsS "https://new.burcev.team/api/health" >/dev/null 2>&1; then
```

3. Line 199 — health check waiting message:
```yaml
# Before:
echo "Still waiting for https://dev.burcev.team (attempt ${i}/60)..."
# After:
echo "Still waiting for https://new.burcev.team (attempt ${i}/60)..."
```

4. Line 719 — rollback deployment_url:
```yaml
# Before:
echo "deployment_url=https://dev.burcev.team" >> $GITHUB_OUTPUT
# After:
echo "deployment_url=https://new.burcev.team" >> $GITHUB_OUTPUT
```

**Step 2: Verify no other references to `dev.burcev.team` remain**

Run: `grep -rn "dev.burcev.team" .github/`
Expected: No output (all replaced)

**Step 3: Commit**

```bash
git add .github/workflows/cd.yml
git commit -m "feat: change dev deployment domain to new.burcev.team"
```

---

### Task 2: Configure DNS (Manual — Owner Action Required)

**This task requires the repository owner to perform manually.**

Add a DNS A record for `new.burcev.team` pointing to the VDS server IP address.

In your DNS provider (where `burcev.team` is managed):

| Type | Name  | Value             | TTL  |
|------|-------|-------------------|------|
| A    | new   | `<VDS_SERVER_IP>` | 300  |

**Verification:**
```bash
dig new.burcev.team +short
# Should return your VDS server IP
```

---

### Task 3: Configure nginx on VDS Server (Manual — Owner Action Required)

**This task requires SSH access to the VDS server.**

**Step 1: Create nginx config for `new.burcev.team`**

Create file `/etc/nginx/sites-available/new.burcev.team`:

```nginx
server {
    listen 80;
    server_name new.burcev.team;

    location / {
        proxy_pass http://127.0.0.1:3071;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

> **Note:** Look at existing configs for `dev.burcev.team` or `beta.burcev.team` as reference:
> ```bash
> ls /etc/nginx/sites-available/
> cat /etc/nginx/sites-available/beta.burcev.team  # or similar name
> ```
> Copy the exact pattern used there, just changing the domain and port.

**Step 2: Enable the site**

```bash
sudo ln -s /etc/nginx/sites-available/new.burcev.team /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

**Step 3: Obtain SSL certificate with certbot**

```bash
sudo certbot --nginx -d new.burcev.team
```

This will automatically update the nginx config with SSL settings.

**Step 4: Verify nginx is serving the domain**

```bash
curl -I https://new.burcev.team
# Should return HTTP 502 (since the container may not be running yet) or HTTP 200 if it is
```

---

### Task 4: Ensure `.env.dev` Exists on the Server (Manual — Owner Action Required)

The CD pipeline expects an env file at `$DEPLOY_PATH/.env.dev` on the VDS server.

**Check if it already exists** (it likely does if `dev` was already deploying to `dev.burcev.team`):

```bash
ssh <user>@<host> "ls -la <DEPLOY_PATH>/.env.dev"
```

If it exists, no action needed. If not, create it with the same structure as `.env.staging` but with dev-specific values.

---

### Task 5: Push and Trigger Deployment

**Step 1: Push the `dev` branch with the updated CD pipeline**

```bash
git push origin dev
```

**Step 2: Verify CI pipeline runs successfully**

Go to GitHub Actions and confirm the CI pipeline passes for `dev`.

**Step 3: Verify CD pipeline deploys to `new.burcev.team`**

After CI completes, the CD pipeline should trigger automatically. Monitor it in GitHub Actions.

**Step 4: Verify the application is live**

```bash
curl -fsS https://new.burcev.team/api/health
# Should return 200 OK
```

Open `https://new.burcev.team` in a browser to confirm the app is working.

---

## Summary of Changes

| What                    | Who           | Where                         |
|-------------------------|---------------|-------------------------------|
| Update cd.yml domain    | Claude/Dev    | `.github/workflows/cd.yml`    |
| DNS A record            | Owner (manual)| DNS provider                  |
| nginx config + SSL      | Owner (manual)| VDS server                    |
| Verify `.env.dev`       | Owner (manual)| VDS server                    |
| Push and verify         | Dev           | `git push origin dev`         |

**Only Task 1 requires code changes.** Tasks 2-4 are server/infrastructure setup that must be done by the repository owner. Task 5 is the deployment trigger.
