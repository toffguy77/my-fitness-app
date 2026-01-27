#!/bin/bash
# Script to add .env files to git in dev branch
# These files are normally ignored but we commit them in dev for shared development

echo "Adding .env files to git (dev branch only)..."

git add -f .env.local
git add -f apps/api/.env
git add -f apps/web/.env.local
git add .gitignore.dev
git add ENV_SETUP.md

echo "✓ Files added successfully"
echo ""
echo "Files staged:"
git status --short

echo ""
echo "Next steps:"
echo "1. Review changes: git status"
echo "2. Commit: git commit -m 'chore: add development environment files'"
echo "3. Push: git push origin dev"
