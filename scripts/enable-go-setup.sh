#!/bin/bash

# Script to re-enable Go setup in ~/.zshrc after autoenv was disabled

echo "🔧 Re-enabling Go setup in ~/.zshrc..."

# Backup current file
cp ~/.zshrc ~/.zshrc.backup.$(date +%Y%m%d_%H%M%S)

# Remove DISABLED comments from Go Setup section
sed -i '' 's/^# DISABLED: //' ~/.zshrc

echo "✅ Go setup re-enabled in ~/.zshrc"
echo "Please restart your terminal or run: source ~/.zshrc"
