# Terminal Blocked - How to Fix

## Problem

Терминал Kiro заблокирован фоновым процессом `npm test`, который не завершается.

## Solution

### Option 1: Kill processes manually in your system terminal

Откройте **новый терминал** (не в Kiro) и выполните:

```bash
# Kill all npm/jest/node processes
pkill -9 npm
pkill -9 jest  
pkill -9 node

# Or kill by port
lsof -ti:3069 | xargs kill -9
lsof -ti:4000 | xargs kill -9

# Verify processes are killed
ps aux | grep -E "(npm|jest|node)" | grep -v grep
```

### Option 2: Use the script

```bash
# In your system terminal (not Kiro)
cd ~/src/my-fitness-app
chmod +x scripts/kill-npm-processes.sh
bash scripts/kill-npm-processes.sh
```

### Option 3: Restart Kiro

Если процессы не убиваются:
1. Закройте Kiro полностью
2. Откройте Activity Monitor (macOS) или Task Manager (Windows)
3. Найдите и убейте все процессы `node`, `npm`, `jest`
4. Перезапустите Kiro

## Prevention

Чтобы избежать блокировки терминала в будущем:

### 1. Don't run long-running commands directly

❌ **Bad:**
```bash
npm test  # Blocks terminal
```

✅ **Good:**
```bash
npm test -- --passWithNoTests  # Runs once and exits
```

### 2. Use Makefile commands

```bash
make test-web      # Runs tests properly
make test-api      # Runs Go tests
make test          # Runs all tests
```

### 3. Use background processes for dev servers

```bash
# Don't use executeBash for dev servers
# Use controlBashProcess instead
make dev  # Uses proper process management
```

## Current Status

После убийства процессов, вы сможете:

1. Добавить .env файлы в git:
```bash
bash scripts/add-env-files.sh
```

2. Закоммитить изменения:
```bash
git add -f .env.local apps/api/.env apps/web/.env.local
git add .gitignore.dev ENV_SETUP.md .env.README.md
git add scripts/add-env-files.sh COMMIT_ENV_FILES.md
git add scripts/kill-npm-processes.sh TERMINAL_BLOCKED.md
git commit -m "chore: add development environment configuration"
```

3. Запушить в dev:
```bash
git push origin dev
```

## Files Ready to Commit

После разблокировки терминала, следующие файлы готовы к коммиту:

**Environment Configuration:**
- `.env.local` - Root configuration
- `apps/api/.env` - Backend configuration  
- `apps/web/.env.local` - Frontend configuration

**Documentation:**
- `ENV_SETUP.md` - Complete setup guide
- `.env.README.md` - Environment files strategy
- `COMMIT_ENV_FILES.md` - How to commit .env files
- `.gitignore.dev` - Dev branch .gitignore
- `TERMINAL_BLOCKED.md` - This file

**Scripts:**
- `scripts/add-env-files.sh` - Add .env to git
- `scripts/kill-npm-processes.sh` - Kill blocking processes

## Next Steps

1. ✅ Kill blocking processes (in system terminal)
2. ⏭️ Add .env files to git
3. ⏭️ Commit changes
4. ⏭️ Push to origin dev
5. ⏭️ Verify database connection: `make -f Makefile.db db-status`
6. ⏭️ Start development: `make dev`
