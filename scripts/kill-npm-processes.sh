#!/bin/bash
# Kill all npm/jest/node processes that might be blocking the terminal

echo "Finding and killing npm/jest/node processes..."

# Find and kill npm processes
pkill -9 npm
pkill -9 jest
pkill -9 node

# Also try to kill by port if processes are using specific ports
lsof -ti:3069 | xargs kill -9 2>/dev/null
lsof -ti:4000 | xargs kill -9 2>/dev/null

echo "✓ Processes killed"
echo ""
echo "Checking remaining processes..."
ps aux | grep -E "(npm|jest|node)" | grep -v grep || echo "No npm/jest/node processes found"
