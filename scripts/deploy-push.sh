#!/bin/bash
# Add, commit, push and watch CD pipeline
set -e
cd "$(dirname "$0")/.."

git add -A
git status
git commit -m "CD pipeline: nginx, frontend, backend builds; docker-compose dev; SSH deploy to new.burcev.team" || true
git push origin dev

echo ""
echo "Watching workflows..."
gh run list --workflow=cd.yml --limit 3
gh run watch --exit-status 2>/dev/null || gh run list --workflow=cd.yml --limit 1
