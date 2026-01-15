#!/bin/bash

# Setup pre-commit hooks for local development
# This script installs and configures pre-commit hooks to catch issues before pushing to GitHub

set -e

echo "🔧 Setting up pre-commit hooks..."

# Check if pre-commit is installed
if ! command -v pre-commit &> /dev/null; then
    echo "📦 Installing pre-commit..."

    # Try to install with brew first (recommended for macOS)
    if command -v brew &> /dev/null; then
        echo "📦 Installing via Homebrew..."
        brew install pre-commit
    # Try pipx (isolated Python environment)
    elif command -v pipx &> /dev/null; then
        echo "📦 Installing via pipx..."
        pipx install pre-commit
    # Try pip3 with --user flag (user-level install)
    elif command -v pip3 &> /dev/null; then
        echo "📦 Installing via pip3 --user..."
        pip3 install --user pre-commit

        # Add user bin to PATH if not already there
        USER_BIN="$HOME/.local/bin"
        if [[ ":$PATH:" != *":$USER_BIN:"* ]]; then
            echo "⚠️  Adding $USER_BIN to PATH for this session"
            export PATH="$USER_BIN:$PATH"
            echo "💡 Add this to your ~/.zshrc or ~/.bashrc:"
            echo "   export PATH=\"\$HOME/.local/bin:\$PATH\""
        fi
    elif command -v pip &> /dev/null; then
        echo "📦 Installing via pip --user..."
        pip install --user pre-commit

        # Add user bin to PATH if not already there
        USER_BIN="$HOME/.local/bin"
        if [[ ":$PATH:" != *":$USER_BIN:"* ]]; then
            echo "⚠️  Adding $USER_BIN to PATH for this session"
            export PATH="$USER_BIN:$PATH"
            echo "💡 Add this to your ~/.zshrc or ~/.bashrc:"
            echo "   export PATH=\"\$HOME/.local/bin:\$PATH\""
        fi
    else
        echo "❌ Error: Could not find brew, pipx, or pip to install pre-commit"
        echo ""
        echo "Please install pre-commit manually:"
        echo "  • Recommended (macOS): brew install pre-commit"
        echo "  • Alternative: pipx install pre-commit"
        echo "  • Or visit: https://pre-commit.com/#install"
        exit 1
    fi
fi

echo "✅ pre-commit is installed"

# Verify pre-commit is accessible
if ! command -v pre-commit &> /dev/null; then
    echo "❌ Error: pre-commit was installed but is not in PATH"
    echo "💡 Try running: export PATH=\"\$HOME/.local/bin:\$PATH\""
    echo "   Then run this script again"
    exit 1
fi

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
echo "⏳ This will run TypeScript check, ESLint, and tests..."
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
