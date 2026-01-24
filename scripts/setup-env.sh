#!/bin/bash
# Setup environment variables for development tools
# Source this file before running Go commands: source scripts/setup-env.sh

# Detect OS
OS="$(uname -s)"

case "${OS}" in
    Darwin*)
        # macOS with Homebrew
        if command -v brew &> /dev/null; then
            export GOROOT="$(brew --prefix go)/libexec"
            export PATH="/opt/homebrew/bin:$GOROOT/bin:$PATH"
        else
            # Fallback to standard Go installation
            export GOROOT="/usr/local/go"
            export PATH="$GOROOT/bin:$PATH"
        fi
        ;;
    Linux*)
        # Linux
        export GOROOT="/usr/local/go"
        export PATH="$GOROOT/bin:$PATH"
        ;;
    *)
        echo "Unknown OS: ${OS}"
        ;;
esac

# Common Go settings
export GOPATH="${HOME}/src/go"
export PATH="$GOPATH/bin:$PATH"

# Verify Go installation
if command -v go &> /dev/null; then
    echo "✅ Go environment configured:"
    echo "   GOROOT: $GOROOT"
    echo "   GOPATH: $GOPATH"
    echo "   Version: $(go version)"
else
    echo "❌ Go not found in PATH"
    echo "   Please install Go: https://go.dev/doc/install"
    echo "   Or on macOS: brew install go"
fi
