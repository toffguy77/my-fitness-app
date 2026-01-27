# How to Commit Environment Files

## Quick Steps

### 1. Make script executable
```bash
chmod +x scripts/add-env-files.sh
```

### 2. Run the script
```bash
bash scripts/add-env-files.sh
```

### 3. Verify staged files
```bash
git status
```

You should see:
```
Changes to be committed:
  new file:   .env.README.md
  new file:   .env.local
  new file:   .gitignore.dev
  new file:   ENV_SETUP.md
  new file:   apps/api/.env
  new file:   apps/web/.env.local
  new file:   scripts/add-env-files.sh
```

### 4. Commit
```bash
git commit -m "chore: add development environment configuration

- Add .env files for dev branch (safe to commit)
- Create ENV_SETUP.md with complete setup guide
- Add .env.README.md explaining branch-specific strategy
- Add .gitignore.dev for dev branch
- Add script to easily add .env files to git

Environment files contain:
- PostgreSQL connection to Yandex.Cloud dev database
- Development JWT secret
- Local API/frontend URLs
- Debug logging configuration
- Disabled feature flags

These credentials are ONLY for development environment
and are safe to commit in dev branch."
```

### 5. Push to origin
```bash
git push origin dev
```

## Manual Method (if script fails)

```bash
# Add files with force flag
git add -f .env.local
git add -f apps/api/.env
git add -f apps/web/.env.local

# Add documentation
git add .gitignore.dev
git add ENV_SETUP.md
git add .env.README.md
git add scripts/add-env-files.sh
git add COMMIT_ENV_FILES.md

# Commit
git commit -m "chore: add development environment configuration"

# Push
git push origin dev
```

## Verification

After pushing, verify on GitHub:
1. Go to repository
2. Switch to `dev` branch
3. Check that `.env` files are visible
4. Verify credentials are correct

## Important Notes

⚠️ **Only for dev branch!**
- These .env files should ONLY be committed in dev branch
- Never commit .env files in staging/production branches
- Production credentials must be stored in GitHub Secrets

✅ **Safe credentials**
- Development database in Yandex.Cloud
- Isolated from production
- Can be safely shared with team

## Next Steps

After committing:
1. Team members can clone and immediately start development
2. No manual .env setup required
3. Database connection works out of the box
4. Run `make dev` to start development

## Troubleshooting

### "fatal: pathspec '.env.local' did not match any files"
The file doesn't exist. Create it first:
```bash
cp .env.local.example .env.local
```

### "The following paths are ignored"
Use the `-f` flag or run the script:
```bash
bash scripts/add-env-files.sh
```

### "Permission denied"
Make script executable:
```bash
chmod +x scripts/add-env-files.sh
```
