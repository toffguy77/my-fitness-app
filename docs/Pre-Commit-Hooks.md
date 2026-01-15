# Pre-Commit Hooks Guide

## Overview

Pre-commit hooks are automated checks that run locally before you commit or push code to GitHub. They catch errors early, before they reach the CI/CD pipeline, saving time and preventing failed builds.

## What's Configured

### On Commit (runs before `git commit`)

1. **ESLint** - Code quality and style checks
   - Validates JavaScript/TypeScript syntax
   - Enforces coding standards
   - Catches common errors

### On Push (runs before `git push`)

2. **NPM Security Audit** - Dependency vulnerability scanning
   - Checks for high-severity vulnerabilities
   - Scans npm packages for known security issues

### File Checks (runs on commit)

3. **Check for large files** - Prevents committing files >1MB
4. **Check for case conflicts** - Prevents case-sensitivity issues
5. **Check JSON syntax** - Validates JSON files
6. **Check YAML syntax** - Validates YAML files
7. **Detect private keys** - Prevents committing secrets
8. **Fix end of files** - Ensures files end with newline
9. **Trim trailing whitespace** - Removes trailing spaces

## Installation

### First Time Setup

```bash
npm run precommit:setup
```

This will:
- Install pre-commit via Homebrew (macOS)
- Install git hooks
- Update hooks to latest versions
- Run a test on all files

### Manual Installation

If the script fails, install manually:

```bash
# Install pre-commit
brew install pre-commit

# Install hooks
pre-commit install
pre-commit install --hook-type commit-msg
pre-commit install --hook-type pre-push
```

## Usage

### Normal Workflow

Pre-commit hooks run automatically:

```bash
git add .
git commit -m "your message"  # Hooks run here
git push                       # Push hooks run here
```

### Manual Testing

Run hooks manually without committing:

```bash
# Run all hooks on all files
npm run precommit:run

# Or use pre-commit directly
pre-commit run --all-files
```

### Skipping Hooks (Not Recommended)

If you need to bypass hooks temporarily:

```bash
git commit --no-verify -m "your message"
git push --no-verify
```

**Warning:** Only skip hooks when absolutely necessary. They exist to catch errors before they reach GitHub.

## Updating Hooks

Keep hooks up to date:

```bash
npm run precommit:update
```

Or:

```bash
pre-commit autoupdate
```

## Troubleshooting

### Hooks Not Running

1. Check if pre-commit is installed:
   ```bash
   pre-commit --version
   ```

2. Reinstall hooks:
   ```bash
   pre-commit install
   ```

### ESLint Failures

If ESLint fails:

1. Run ESLint directly to see errors:
   ```bash
   npm run lint
   ```

2. Auto-fix what you can:
   ```bash
   npm run lint -- --fix
   ```

3. Fix remaining errors manually

### Security Audit Failures

If npm audit fails:

1. Review vulnerabilities:
   ```bash
   npm audit
   ```

2. Update dependencies:
   ```bash
   npm audit fix
   ```

3. For unfixable issues, document in `.trivyignore` or update packages manually

### YAML Syntax Errors

If YAML validation fails:

1. Check the specific file mentioned in the error
2. Use a YAML validator online or in your editor
3. Common issues:
   - Incorrect indentation (use spaces, not tabs)
   - Missing quotes around special characters
   - Duplicate keys

## Configuration

### Pre-commit Config

Location: `.pre-commit-config.yaml`

To modify hooks:

1. Edit `.pre-commit-config.yaml`
2. Update hooks:
   ```bash
   pre-commit autoupdate
   ```
3. Test changes:
   ```bash
   pre-commit run --all-files
   ```

### Excluding Files

To exclude files from specific hooks, edit `.pre-commit-config.yaml`:

```yaml
- id: trailing-whitespace
  exclude: |
    (?x)^(
      .*\.md$|
      node_modules/.*
    )$
```

## Benefits

1. **Faster Feedback** - Catch errors in seconds, not minutes
2. **Fewer Failed Builds** - Prevent CI/CD pipeline failures
3. **Better Code Quality** - Enforce standards before code review
4. **Security** - Prevent committing secrets or vulnerabilities
5. **Consistency** - Same checks for all developers

## Integration with CI/CD

Pre-commit hooks complement (not replace) GitHub Actions:

- **Local (pre-commit)**: Fast feedback, basic checks
- **GitHub Actions (CI)**: Comprehensive testing, deployment

Both run the same checks, but pre-commit catches issues earlier.

## Best Practices

1. **Always run hooks** - Don't skip unless absolutely necessary
2. **Fix issues immediately** - Don't commit broken code
3. **Keep hooks updated** - Run `npm run precommit:update` regularly
4. **Test before pushing** - Run `npm run precommit:run` before big changes
5. **Share with team** - Ensure all developers have hooks installed

## Related Documentation

- [CI/CD System Guide](./CICD_System_Guide.md)
- [Quality Gates](./CICD_Deployment_Procedures.md)
- [Security Guide](./Security_Guide.md)
