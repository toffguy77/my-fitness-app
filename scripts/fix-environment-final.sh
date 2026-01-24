#!/bin/bash

# Final environment fix for BURCEV project
# This script fixes .zshrc to work correctly with Homebrew, Go, and without autoenv

set -e

ZSHRC="$HOME/.zshrc"
BACKUP="$ZSHRC.backup.$(date +%Y%m%d_%H%M%S)"

echo "🔧 Fixing environment configuration..."

# Backup
cp "$ZSHRC" "$BACKUP"
echo "✅ Backup created: $BACKUP"

# Create new .zshrc with correct order
cat > "$ZSHRC" << 'ZSHRC_END'
# Enable Powerlevel10k instant prompt. Should stay close to the top of ~/.zshrc.
if [[ -r "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh" ]]; then
  source "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh"
fi

# ============================================================================
# Homebrew Setup (MUST be first - before any brew commands)
# ============================================================================
if [[ -f "/opt/homebrew/bin/brew" ]]; then
  eval "$(/opt/homebrew/bin/brew shellenv)"
fi

# ============================================================================
# Oh My Zsh
# ============================================================================
export ZSH="$HOME/.oh-my-zsh"
ZSH_THEME="powerlevel10k/powerlevel10k"
plugins=(git)
source $ZSH/oh-my-zsh.sh

# ============================================================================
# Go Setup (after Homebrew is in PATH)
# ============================================================================
if command -v brew &> /dev/null && brew list go &> /dev/null; then
  export GOPATH="$HOME/src/go"
  export GOROOT="$(brew --prefix go)/libexec"
  export PATH="$PATH:$GOPATH/bin:$GOROOT/bin"
fi

# ============================================================================
# Aliases
# ============================================================================
alias docker=podman
alias ll='ls -laH'

# ============================================================================
# Powerlevel10k Configuration
# ============================================================================
[[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh
ZSHRC_END

echo "✅ .zshrc updated successfully"
echo ""
echo "📝 Changes made:"
echo "  - Removed autoenv (was causing terminal hangs)"
echo "  - Fixed Homebrew initialization order"
echo "  - Added safe Go setup with brew check"
echo "  - Simplified configuration"
echo ""
echo "🔄 Please restart your terminal or run:"
echo "   source ~/.zshrc"
