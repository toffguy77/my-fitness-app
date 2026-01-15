#!/bin/bash

# Setup pre-commit hooks for local development
# This script installs and configures pre-commit hooks to catch issues before pushing to GitHub

set -e

echo "🔧 Setting up pre-commit hooks..."

# Check if pre-commit is installed
if ! command -v pre-commit &> /dev/null; then
    echo "📦 Installing pre-commit..."
    
    # Try to install with pip
    if command -v pip3 &> /dev/null; then
        pip3 install pre-commit
    elif command -v pip &> /dev/null; then
        pip install pre-commit
    elif command -v brew &> /dev/null; then
        echo "📦 Installing via Homebrew..."
        brew install pre-commit
    else
        echo "❌ Error: Could not find pip or brew to install pre-commit"
        echo "Please install pre-commit manually: https://pre-commit.com/#install"
        exit 1
    fi
fi

echo "✅ pre-commit is installed"

# Install the git hooks
echo "🔗 Installing git hooks..."
pre-commit install
pre-commit install --hook-type commit-msg
pre-commit install --hook-type pre-push

echo "✅ Git hooks installed"

# Update hooks to latest versions
echo "🔄 Updating hooks to latest versions..."
pre-commit autoupdate

echo "✅ Hooks updated"

# Run hooks on all files to verify setup
echo "🧪 Testing hooks on all files (this may take a moment)..."
if pre-commit run --all-files; then
    echo "✅ All hooks passed!"
else
    echo "⚠️  Some hooks failed. Please fix the issues and commit again."
    echo "You can run 'pre-commit run --all-files' to test again."
fi

echo ""
echo "✨ Pre-commit hooks are now set up!"
echo ""
echo "📝 What happens now:"
echo "  • Before each commit: TypeScript check, ESLint, and tests will run"
echo "  • Before each push: Security audit will run"
echo "  • If any check fails, the commit/push will be blocked"
echo ""
echo "💡 Useful commands:"
echo "  • Skip hooks (not recommended): git commit --no-verify"
echo "  • Run hooks manually: pre-commit run --all-files"
echo "  • Update hooks: pre-commit autoupdate"
echo "  • Uninstall hooks: pre-commit uninstall"
echo ""
