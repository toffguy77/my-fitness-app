#!/bin/bash

# Fix ~/.zshrc to properly setup Homebrew PATH before using brew command
# This fixes the "command not found: brew" error during zsh initialization

echo "🔧 Fixing ~/.zshrc..."

# Backup original
cp ~/.zshrc ~/.zshrc.backup.$(date +%Y%m%d_%H%M%S)
echo "✓ Backup created: ~/.zshrc.backup.$(date +%Y%m%d_%H%M%S)"

# Create fixed version
cat > /tmp/zshrc_fixed << 'ZSHRC_END'
# Enable Powerlevel10k instant prompt. Should stay close to the top of ~/.zshrc.
# Initialization code that may require console input (password prompts, [y/n]
# confirmations, etc.) must go above this block; everything else may go below.
if [[ -r "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh" ]]; then
  source "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh"
fi

# ============================================================================
# Homebrew Setup (MUST be before any brew commands)
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
# Autoenv (after Homebrew is in PATH)
# ============================================================================
if [[ -f "/opt/homebrew/opt/autoenv/activate.sh" ]]; then
  source /opt/homebrew/opt/autoenv/activate.sh
fi

# ============================================================================
# Go Setup (after Homebrew is in PATH)
# ============================================================================
if command -v brew &> /dev/null; then
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

# Apply the fix
mv /tmp/zshrc_fixed ~/.zshrc

echo "✓ ~/.zshrc fixed!"
echo ""
echo "Changes made:"
echo "  1. Added Homebrew shellenv setup at the top (after p10k instant prompt)"
echo "  2. Moved autoenv source after Homebrew is in PATH"
echo "  3. Added check for brew command before using it"
echo "  4. Organized sections with clear headers"
echo ""
echo "⚠️  You need to restart your terminal or run: source ~/.zshrc"
echo ""
echo "If something goes wrong, restore backup with:"
echo "  cp ~/.zshrc.backup.* ~/.zshrc"
