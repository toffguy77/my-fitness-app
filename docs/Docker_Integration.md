# Docker Integration for CI/CD

This document describes the comprehensive Docker integration setup for the CI/CD pipeline, including optimized builds, security scanning, container registry management, and tagging strategies.

## Overview

The Docker integration provides:

- **Optimized Multi-stage Builds**: Efficient layer caching and minimal production images
- **Security Scanning**: Automated vulnerability detection and best practices validation
- **Container Registry Management**: Automated image publishing and cleanup
- **Comprehensive Tagging Strategy**: Semantic versioning and environment-based tags
- **Development Support**: Hot-reload development containers

## Architecture

### Multi-stage Dockerfile

The Dockerfile uses multiple stages for optimization:

1. **base**: Common Alpine Linux base with security updates
2. **deps**: Production dependencies only
3. **dev-deps**: All dependencies including development tools
4. **builder**: Application build stage
5. **security-scan**: Security scanning stage for CI/CD
6. **runner**: Minimal production runtime
7. **development**: Development stage with hot reload

### Security Features

- Non-root user execution
- Minimal attack surface
- Regular security updates
- Vulnerability scanning with Trivy
- Best practices validation with Hadolint

## Usage

### Local Development

```bash
# Start development environment with hot reload
make docker-dev

# Build production image
make docker-build-prod

# Run security scan
make docker-scan
```

### CI/CD Pipeline

The Docker integration is automatically triggered in CI/CD:

1. **Build**: Multi-architecture images (AMD64, ARM64)
2. **Scan**: Security vulnerability scanning
3. **Tag**: Comprehensive tagging strategy
4. **Push**: Automated registry publishing
5. **Cleanup**: Old image cleanup

### Container Registry Management

#### Tagging Strategy

The system uses a comprehensive tagging strategy:

- **Commit-based**: `app:abc1234` (traceability)
- **Branch-based**: `app:latest`, `app:develop` (environment)
- **Version-based**: `app:v1.2.3`, `app:v1.2`, `app:v1` (semantic)
- **Date-based**: `app:20240112-abc1234` (archival)
- **Environment-based**: `app:staging`, `app:production` (deployment)

#### Cleanup Strategy

Automated cleanup runs weekly:

- Keep 10 most recent versions by default
- Remove untagged images
- Preserve important tags (latest, stable, release)
- Generate cleanup reports

## Configuration

### Environment Variables

#### Build Arguments

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_APP_VERSION=1.0.0
```

#### Registry Configuration

```bash
REGISTRY=ghcr.io
GITHUB_REPOSITORY=your-org/your-repo
ENVIRONMENT=production
```

### Docker Compose Profiles

The system supports multiple profiles:

```bash
# Production (default)
docker compose up

# Development with hot reload
docker compose --profile development up app-dev

# Security scanning
docker compose --profile security up security-scan
```

## Scripts

### docker-tagging-strategy.sh

Implements comprehensive tagging strategy:

```bash
# Generate tags for current state
./scripts/docker-tagging-strategy.sh my-fitness-app ghcr.io org/repo generate-tags

# Build with all tags
./scripts/docker-tagging-strategy.sh my-fitness-app ghcr.io org/repo build

# Push all tags
./scripts/docker-tagging-strategy.sh my-fitness-app ghcr.io org/repo push
```

### container-registry-cleanup.sh

Manages registry cleanup:

```bash
# Dry run cleanup
./scripts/container-registry-cleanup.sh ghcr org/repo 10 true

# Actual cleanup
./scripts/container-registry-cleanup.sh ghcr org/repo 10 false
```

### docker-security-scan.sh

Comprehensive security scanning:

```bash
# Scan image for vulnerabilities
./scripts/docker-security-scan.sh my-fitness-app latest
```

## GitHub Actions Workflows

### docker-build-push.yml

Main build and push workflow:

- Triggers on push to main/develop branches
- Builds multi-architecture images
- Runs security scans
- Pushes to GitHub Container Registry
- Cleans up old images

### container-registry-management.yml

Registry management workflow:

- Scheduled weekly cleanup
- Manual cleanup with options
- Registry audit reports
- Tag strategy validation

## Security

### Vulnerability Scanning

Automated scanning with Trivy:

- **Critical/High**: Fails the build
- **Medium/Low**: Reported but doesn't fail
- **SARIF**: Results uploaded to GitHub Security tab

### Best Practices

- Non-root user execution
- Minimal base images
- Regular security updates
- Secrets management
- Image signing (future enhancement)

### Security Thresholds

- **Critical vulnerabilities**: 0 allowed
- **High vulnerabilities**: Maximum 5 allowed
- **Image size**: Monitored and reported
- **Base image age**: Tracked for updates

## Monitoring

### Health Checks

The application includes health check endpoints:

- **Endpoint**: `/api/health`
- **Docker**: Built-in health check
- **Kubernetes**: Readiness/liveness probes

### Metrics

Tracked metrics include:

- Build duration
- Image size
- Vulnerability count
- Registry storage usage
- Cleanup effectiveness

## Troubleshooting

### Common Issues

#### Build Failures

```bash
# Check build logs
docker build --no-cache .

# Verify dependencies
npm ci

# Check TypeScript
npm run type-check
```

#### Security Scan Failures

```bash
# Run local security scan
./scripts/docker-security-scan.sh my-fitness-app latest

# Check vulnerability details
trivy image my-fitness-app:latest
```

#### Registry Issues

```bash
# Check authentication
docker login ghcr.io

# Verify permissions
gh auth status

# Test push
docker push ghcr.io/org/repo/app:test
```

### Performance Optimization

#### Build Speed

- Use BuildKit for parallel builds
- Optimize layer caching
- Minimize context size
- Use multi-stage builds

#### Image Size

- Use Alpine Linux base
- Remove unnecessary packages
- Optimize dependencies
- Use .dockerignore

## Best Practices

### Development

1. **Use development profile** for local development
2. **Test builds locally** before pushing
3. **Run security scans** regularly
4. **Monitor image sizes** and optimize

### Production

1. **Use semantic versioning** for releases
2. **Tag important releases** to prevent cleanup
3. **Monitor security vulnerabilities** continuously
4. **Keep base images updated** regularly

### CI/CD

1. **Use multi-stage builds** for optimization
2. **Implement security gates** in pipeline
3. **Automate cleanup** to manage costs
4. **Monitor build performance** and optimize

## Future Enhancements

### Planned Features

- **Image signing** with Cosign
- **SBOM generation** for supply chain security
- **Multi-registry support** (Docker Hub, ECR, GCR)
- **Advanced cleanup policies** based on usage
- **Performance monitoring** and alerting

### Integration Opportunities

- **Kubernetes deployment** with Helm charts
- **Service mesh** integration (Istio, Linkerd)
- **Monitoring stack** (Prometheus, Grafana)
- **Log aggregation** (ELK, Loki)

## References

- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [Multi-stage Builds](https://docs.docker.com/develop/multistage-build/)
- [Security Scanning](https://docs.docker.com/engine/scan/)
- [GitHub Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)
- [Trivy Security Scanner](https://trivy.dev/)