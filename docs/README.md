# BURCEV Documentation

## Overview

This is a clean development environment with full CI/CD infrastructure for the BURCEV fitness application.

## Getting Started

See the main [README.md](../README.md) for quick start instructions.

## Deployment Environments

- **Development**: https://dev.burcev.team (port 3071) - dev branch
- **Staging**: https://beta.burcev.team (port 3070) - develop branch  
- **Production**: https://burcev.team (port 3069) - main branch

## CI/CD Pipeline

The project includes comprehensive CI/CD automation:

- **CI Pipeline**: Runs on push to dev, develop, main branches
  - Linting and type checking
  - Unit tests with coverage
  - E2E tests
  - Security scanning
  - Quality gates

- **CD Pipeline**: Automatic deployment after successful CI
  - Docker image building
  - Container registry push
  - VPS deployment via SSH
  - Health checks
  - Automatic rollback on failure

## Infrastructure

All infrastructure code is maintained:
- `.github/workflows/` - GitHub Actions workflows
- `scripts/` - Build and deployment scripts
- `deploy/` - Deployment configurations
- `Dockerfile` - Multi-stage Docker build
- `docker-compose.yml` - Container orchestration
- `Makefile` - Common commands

## Next Steps

Start building your application in the `src/` directory following the project structure conventions.
