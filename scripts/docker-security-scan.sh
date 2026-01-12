#!/bin/bash

# Docker Security Scanning Script for CI/CD
# This script performs comprehensive security scanning of Docker images

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
IMAGE_NAME=${1:-"my-fitness-app"}
IMAGE_TAG=${2:-"latest"}
FULL_IMAGE_NAME="${IMAGE_NAME}:${IMAGE_TAG}"
SCAN_RESULTS_DIR="./docker-scan-results"

echo -e "${GREEN}Starting Docker security scan for ${FULL_IMAGE_NAME}${NC}"

# Create results directory
mkdir -p "${SCAN_RESULTS_DIR}"

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to install Trivy if not present
install_trivy() {
    if ! command_exists trivy; then
        echo -e "${YELLOW}Installing Trivy security scanner...${NC}"
        if [[ "$OSTYPE" == "linux-gnu"* ]]; then
            # Linux
            curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin
        elif [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            if command_exists brew; then
                brew install trivy
            else
                echo -e "${RED}Please install Homebrew or Trivy manually${NC}"
                exit 1
            fi
        else
            echo -e "${RED}Unsupported OS for automatic Trivy installation${NC}"
            exit 1
        fi
    fi
}

# Function to scan with Trivy
scan_with_trivy() {
    echo -e "${GREEN}Running Trivy vulnerability scan...${NC}"
    
    # Scan for vulnerabilities
    trivy image \
        --format json \
        --output "${SCAN_RESULTS_DIR}/trivy-vulnerabilities.json" \
        "${FULL_IMAGE_NAME}"
    
    # Scan for misconfigurations
    trivy image \
        --scanners config \
        --format json \
        --output "${SCAN_RESULTS_DIR}/trivy-config.json" \
        "${FULL_IMAGE_NAME}"
    
    # Generate human-readable report
    trivy image \
        --format table \
        --output "${SCAN_RESULTS_DIR}/trivy-report.txt" \
        "${FULL_IMAGE_NAME}"
    
    # Check for critical vulnerabilities
    CRITICAL_COUNT=$(trivy image --format json "${FULL_IMAGE_NAME}" | jq '[.Results[]?.Vulnerabilities[]? | select(.Severity == "CRITICAL")] | length')
    HIGH_COUNT=$(trivy image --format json "${FULL_IMAGE_NAME}" | jq '[.Results[]?.Vulnerabilities[]? | select(.Severity == "HIGH")] | length')
    
    echo -e "${YELLOW}Security scan results:${NC}"
    echo -e "Critical vulnerabilities: ${CRITICAL_COUNT}"
    echo -e "High vulnerabilities: ${HIGH_COUNT}"
    
    # Fail if critical vulnerabilities found
    if [ "${CRITICAL_COUNT}" -gt 0 ]; then
        echo -e "${RED}❌ Critical vulnerabilities found! Build should fail.${NC}"
        return 1
    elif [ "${HIGH_COUNT}" -gt 5 ]; then
        echo -e "${YELLOW}⚠️  Too many high-severity vulnerabilities found (${HIGH_COUNT} > 5)${NC}"
        return 1
    else
        echo -e "${GREEN}✅ Security scan passed${NC}"
        return 0
    fi
}

# Function to scan Docker best practices
scan_docker_best_practices() {
    echo -e "${GREEN}Checking Docker best practices...${NC}"
    
    # Check if Dockerfile follows best practices
    if command_exists hadolint; then
        echo -e "${GREEN}Running Hadolint Dockerfile linter...${NC}"
        hadolint Dockerfile > "${SCAN_RESULTS_DIR}/hadolint-report.txt" || true
    else
        echo -e "${YELLOW}Hadolint not found, skipping Dockerfile linting${NC}"
    fi
    
    # Check image size
    IMAGE_SIZE=$(docker images "${FULL_IMAGE_NAME}" --format "table {{.Size}}" | tail -n 1)
    echo -e "${YELLOW}Image size: ${IMAGE_SIZE}${NC}"
    
    # Check for non-root user
    USER_CHECK=$(docker run --rm "${FULL_IMAGE_NAME}" whoami 2>/dev/null || echo "unknown")
    if [ "${USER_CHECK}" != "nextjs" ] && [ "${USER_CHECK}" != "unknown" ]; then
        echo -e "${YELLOW}⚠️  Container might be running as root user${NC}"
    else
        echo -e "${GREEN}✅ Container running as non-root user: ${USER_CHECK}${NC}"
    fi
}

# Function to generate security report
generate_security_report() {
    echo -e "${GREEN}Generating security report...${NC}"
    
    cat > "${SCAN_RESULTS_DIR}/security-report.md" << EOF
# Docker Security Scan Report

**Image:** ${FULL_IMAGE_NAME}
**Scan Date:** $(date)
**Scan Results Directory:** ${SCAN_RESULTS_DIR}

## Summary

- **Critical Vulnerabilities:** ${CRITICAL_COUNT:-0}
- **High Vulnerabilities:** ${HIGH_COUNT:-0}
- **Image Size:** ${IMAGE_SIZE:-unknown}
- **User:** ${USER_CHECK:-unknown}

## Files Generated

- \`trivy-vulnerabilities.json\` - Detailed vulnerability report
- \`trivy-config.json\` - Configuration issues
- \`trivy-report.txt\` - Human-readable vulnerability report
- \`hadolint-report.txt\` - Dockerfile best practices report (if available)

## Recommendations

1. Regularly update base images
2. Use multi-stage builds to reduce attack surface
3. Run containers as non-root users
4. Scan images in CI/CD pipeline
5. Monitor for new vulnerabilities

EOF

    echo -e "${GREEN}Security report generated: ${SCAN_RESULTS_DIR}/security-report.md${NC}"
}

# Main execution
main() {
    # Check if Docker image exists
    if ! docker image inspect "${FULL_IMAGE_NAME}" >/dev/null 2>&1; then
        echo -e "${RED}Docker image ${FULL_IMAGE_NAME} not found. Please build it first.${NC}"
        exit 1
    fi
    
    # Install security tools
    install_trivy
    
    # Run security scans
    if scan_with_trivy; then
        SCAN_RESULT=0
    else
        SCAN_RESULT=1
    fi
    
    # Run best practices check
    scan_docker_best_practices
    
    # Generate report
    generate_security_report
    
    echo -e "${GREEN}Security scan completed. Results saved to ${SCAN_RESULTS_DIR}${NC}"
    
    exit ${SCAN_RESULT}
}

# Run main function
main "$@"