# Docker Security Scan Report

**Image:** my-fitness-app:deps-test
**Scan Date:** Mon Jan 12 19:42:38 MSK 2026
**Scan Results Directory:** ./docker-scan-results

## Summary

- **Critical Vulnerabilities:** 0
- **High Vulnerabilities:** 0
- **Image Size:** 866 MB
- **User:** root

## Files Generated

- `trivy-vulnerabilities.json` - Detailed vulnerability report
- `trivy-config.json` - Configuration issues
- `trivy-report.txt` - Human-readable vulnerability report
- `hadolint-report.txt` - Dockerfile best practices report (if available)

## Recommendations

1. Regularly update base images
2. Use multi-stage builds to reduce attack surface
3. Run containers as non-root users
4. Scan images in CI/CD pipeline
5. Monitor for new vulnerabilities
