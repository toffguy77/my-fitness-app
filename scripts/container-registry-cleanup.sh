#!/bin/bash

# Container Registry Cleanup Script
# This script manages cleanup of old container images from various registries

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
REGISTRY_TYPE=${1:-"ghcr"}  # ghcr, docker, ecr, gcr
IMAGE_NAME=${2:-"my-fitness-app"}
KEEP_VERSIONS=${3:-10}
DRY_RUN=${4:-false}

echo -e "${GREEN}Container Registry Cleanup${NC}"
echo -e "${BLUE}Registry: ${REGISTRY_TYPE}${NC}"
echo -e "${BLUE}Image: ${IMAGE_NAME}${NC}"
echo -e "${BLUE}Keep versions: ${KEEP_VERSIONS}${NC}"
echo -e "${BLUE}Dry run: ${DRY_RUN}${NC}"

# Function to cleanup GitHub Container Registry
cleanup_ghcr() {
    local org_or_user=$1
    local package_name=$2
    
    echo -e "${GREEN}Cleaning up GitHub Container Registry...${NC}"
    
    if [ "${DRY_RUN}" = "true" ]; then
        echo -e "${YELLOW}DRY RUN: Would delete old versions of ${org_or_user}/${package_name}${NC}"
        return 0
    fi
    
    # Get package versions (requires GitHub CLI)
    if ! command -v gh >/dev/null 2>&1; then
        echo -e "${RED}GitHub CLI (gh) not found. Please install it first.${NC}"
        return 1
    fi
    
    # List and delete old versions
    gh api \
        -H "Accept: application/vnd.github+json" \
        -H "X-GitHub-Api-Version: 2022-11-28" \
        "/orgs/${org_or_user}/packages/container/${package_name}/versions" \
        --jq "sort_by(.created_at) | reverse | .[${KEEP_VERSIONS}:] | .[].id" \
        | while read -r version_id; do
            if [ -n "$version_id" ]; then
                echo -e "${YELLOW}Deleting version ID: ${version_id}${NC}"
                gh api \
                    --method DELETE \
                    -H "Accept: application/vnd.github+json" \
                    -H "X-GitHub-Api-Version: 2022-11-28" \
                    "/orgs/${org_or_user}/packages/container/${package_name}/versions/${version_id}"
            fi
        done
}

# Function to cleanup Docker Hub
cleanup_docker_hub() {
    local repository=$1
    
    echo -e "${GREEN}Cleaning up Docker Hub...${NC}"
    
    if [ "${DRY_RUN}" = "true" ]; then
        echo -e "${YELLOW}DRY RUN: Would delete old versions of ${repository}${NC}"
        return 0
    fi
    
    # Docker Hub cleanup requires API token
    if [ -z "${DOCKER_HUB_TOKEN}" ]; then
        echo -e "${RED}DOCKER_HUB_TOKEN environment variable not set${NC}"
        return 1
    fi
    
    # Get authentication token
    local token=$(curl -s -H "Content-Type: application/json" \
        -X POST \
        -d "{\"username\": \"${DOCKER_HUB_USERNAME}\", \"password\": \"${DOCKER_HUB_TOKEN}\"}" \
        https://hub.docker.com/v2/users/login/ | jq -r .token)
    
    # Get tags and delete old ones
    curl -s -H "Authorization: JWT ${token}" \
        "https://hub.docker.com/v2/repositories/${repository}/tags/?page_size=100" \
        | jq -r ".results | sort_by(.last_updated) | reverse | .[${KEEP_VERSIONS}:] | .[].name" \
        | while read -r tag; do
            if [ -n "$tag" ] && [ "$tag" != "latest" ]; then
                echo -e "${YELLOW}Deleting tag: ${tag}${NC}"
                curl -s -X DELETE \
                    -H "Authorization: JWT ${token}" \
                    "https://hub.docker.com/v2/repositories/${repository}/tags/${tag}/"
            fi
        done
}

# Function to cleanup AWS ECR
cleanup_ecr() {
    local repository=$1
    local region=${AWS_REGION:-us-east-1}
    
    echo -e "${GREEN}Cleaning up AWS ECR...${NC}"
    
    if [ "${DRY_RUN}" = "true" ]; then
        echo -e "${YELLOW}DRY RUN: Would delete old images from ${repository}${NC}"
        return 0
    fi
    
    # Check if AWS CLI is available
    if ! command -v aws >/dev/null 2>&1; then
        echo -e "${RED}AWS CLI not found. Please install it first.${NC}"
        return 1
    fi
    
    # Get image digests to delete (keep latest N images)
    aws ecr describe-images \
        --repository-name "${repository}" \
        --region "${region}" \
        --query "sort_by(imageDetails, &imagePushedAt)[:-${KEEP_VERSIONS}].imageDigest" \
        --output text \
        | tr '\t' '\n' \
        | while read -r digest; do
            if [ -n "$digest" ]; then
                echo -e "${YELLOW}Deleting image with digest: ${digest}${NC}"
                aws ecr batch-delete-image \
                    --repository-name "${repository}" \
                    --region "${region}" \
                    --image-ids imageDigest="${digest}"
            fi
        done
}

# Function to cleanup Google Container Registry
cleanup_gcr() {
    local project_id=$1
    local image_name=$2
    
    echo -e "${GREEN}Cleaning up Google Container Registry...${NC}"
    
    if [ "${DRY_RUN}" = "true" ]; then
        echo -e "${YELLOW}DRY RUN: Would delete old images from gcr.io/${project_id}/${image_name}${NC}"
        return 0
    fi
    
    # Check if gcloud is available
    if ! command -v gcloud >/dev/null 2>&1; then
        echo -e "${RED}Google Cloud CLI (gcloud) not found. Please install it first.${NC}"
        return 1
    fi
    
    # List and delete old images
    gcloud container images list-tags "gcr.io/${project_id}/${image_name}" \
        --limit=999999 \
        --sort-by=TIMESTAMP \
        --format="get(digest)" \
        | tail -n +$((KEEP_VERSIONS + 1)) \
        | while read -r digest; do
            if [ -n "$digest" ]; then
                echo -e "${YELLOW}Deleting image with digest: ${digest}${NC}"
                gcloud container images delete "gcr.io/${project_id}/${image_name}@${digest}" --quiet
            fi
        done
}

# Function to generate cleanup report
generate_cleanup_report() {
    local registry=$1
    local image=$2
    
    cat > "./container-cleanup-report.md" << EOF
# Container Registry Cleanup Report

**Date:** $(date)
**Registry:** ${registry}
**Image:** ${image}
**Versions Kept:** ${KEEP_VERSIONS}
**Dry Run:** ${DRY_RUN}

## Summary

This cleanup operation helps maintain container registry storage costs and organization by removing old image versions while keeping the most recent ones.

## Cleanup Strategy

1. **Keep Recent Versions:** Preserve the ${KEEP_VERSIONS} most recent image versions
2. **Remove Old Versions:** Delete older versions to free up storage
3. **Preserve Tags:** Keep important tags like 'latest', 'stable', etc.
4. **Safety First:** Always test with dry run before actual deletion

## Best Practices

- Run cleanup regularly (weekly/monthly)
- Monitor storage usage and costs
- Keep enough versions for rollback scenarios
- Use semantic versioning for better organization
- Tag important releases to prevent accidental deletion

EOF

    echo -e "${GREEN}Cleanup report generated: container-cleanup-report.md${NC}"
}

# Main execution
main() {
    case "${REGISTRY_TYPE}" in
        "ghcr"|"github")
            # Extract org/user and package name from IMAGE_NAME
            IFS='/' read -r org_or_user package_name <<< "${IMAGE_NAME}"
            cleanup_ghcr "${org_or_user}" "${package_name}"
            ;;
        "docker"|"dockerhub")
            cleanup_docker_hub "${IMAGE_NAME}"
            ;;
        "ecr"|"aws")
            cleanup_ecr "${IMAGE_NAME}"
            ;;
        "gcr"|"google")
            # Extract project ID and image name
            IFS='/' read -r project_id image_name <<< "${IMAGE_NAME}"
            cleanup_gcr "${project_id}" "${image_name}"
            ;;
        *)
            echo -e "${RED}Unsupported registry type: ${REGISTRY_TYPE}${NC}"
            echo -e "${YELLOW}Supported types: ghcr, docker, ecr, gcr${NC}"
            exit 1
            ;;
    esac
    
    generate_cleanup_report "${REGISTRY_TYPE}" "${IMAGE_NAME}"
    
    echo -e "${GREEN}Container registry cleanup completed${NC}"
}

# Show usage if no arguments provided
if [ $# -eq 0 ]; then
    echo -e "${YELLOW}Usage: $0 <registry_type> <image_name> [keep_versions] [dry_run]${NC}"
    echo -e "${YELLOW}Example: $0 ghcr myorg/myapp 10 true${NC}"
    echo -e "${YELLOW}Registry types: ghcr, docker, ecr, gcr${NC}"
    exit 1
fi

# Run main function
main "$@"