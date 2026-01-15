#!/bin/bash

# Docker Image Tagging Strategy Script
# This script implements a comprehensive tagging strategy for container images

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
IMAGE_NAME=${1:-"my-fitness-app"}
REGISTRY=${2:-"ghcr.io"}
REPOSITORY=${3:-"$GITHUB_REPOSITORY"}
FULL_IMAGE_NAME="${REGISTRY}/${REPOSITORY}/${IMAGE_NAME}"

# Get version information
GIT_COMMIT=$(git rev-parse --short HEAD)
GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
GIT_TAG=$(git describe --tags --exact-match 2>/dev/null || echo "")
BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
VERSION=$(cat package.json | jq -r '.version' 2>/dev/null || echo "unknown")

echo -e "${GREEN}Docker Image Tagging Strategy${NC}"
echo -e "${BLUE}Image: ${FULL_IMAGE_NAME}${NC}"
echo -e "${BLUE}Commit: ${GIT_COMMIT}${NC}"
echo -e "${BLUE}Branch: ${GIT_BRANCH}${NC}"
echo -e "${BLUE}Tag: ${GIT_TAG}${NC}"
echo -e "${BLUE}Version: ${VERSION}${NC}"

# Function to generate tags based on context
generate_tags() {
    local tags=()

    # Always include commit-based tag for traceability
    tags+=("${FULL_IMAGE_NAME}:${GIT_COMMIT}")

    # Branch-based tags
    if [ "${GIT_BRANCH}" = "main" ] || [ "${GIT_BRANCH}" = "master" ]; then
        tags+=("${FULL_IMAGE_NAME}:latest")
        tags+=("${FULL_IMAGE_NAME}:stable")
    elif [ "${GIT_BRANCH}" = "develop" ]; then
        tags+=("${FULL_IMAGE_NAME}:develop")
        tags+=("${FULL_IMAGE_NAME}:beta")
    else
        # Feature branch
        SAFE_BRANCH=$(echo "${GIT_BRANCH}" | sed 's/[^a-zA-Z0-9._-]/-/g')
        tags+=("${FULL_IMAGE_NAME}:branch-${SAFE_BRANCH}")
    fi

    # Version-based tags (if semantic version)
    if [[ "${VERSION}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        tags+=("${FULL_IMAGE_NAME}:v${VERSION}")

        # Extract major and minor versions
        MAJOR=$(echo "${VERSION}" | cut -d. -f1)
        MINOR=$(echo "${VERSION}" | cut -d. -f2)

        tags+=("${FULL_IMAGE_NAME}:v${MAJOR}")
        tags+=("${FULL_IMAGE_NAME}:v${MAJOR}.${MINOR}")
    fi

    # Git tag-based tags
    if [ -n "${GIT_TAG}" ]; then
        tags+=("${FULL_IMAGE_NAME}:${GIT_TAG}")

        # If it's a release tag (starts with v)
        if [[ "${GIT_TAG}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
            tags+=("${FULL_IMAGE_NAME}:release")
        fi
    fi

    # Date-based tag for archival
    DATE_TAG=$(date -u +"%Y%m%d")
    tags+=("${FULL_IMAGE_NAME}:${DATE_TAG}-${GIT_COMMIT}")

    # Environment-specific tags (if specified)
    if [ -n "${ENVIRONMENT}" ]; then
        tags+=("${FULL_IMAGE_NAME}:${ENVIRONMENT}")
        tags+=("${FULL_IMAGE_NAME}:${ENVIRONMENT}-${GIT_COMMIT}")
    fi

    # Print all tags
    printf '%s\n' "${tags[@]}"
}

# Function to build image with all tags
build_with_tags() {
    local build_args=()
    local tag_args=()

    # Build arguments
    build_args+=(--build-arg "GIT_COMMIT=${GIT_COMMIT}")
    build_args+=(--build-arg "GIT_BRANCH=${GIT_BRANCH}")
    build_args+=(--build-arg "BUILD_DATE=${BUILD_DATE}")
    build_args+=(--build-arg "VERSION=${VERSION}")

    # Add environment-specific build args
    if [ -n "${NEXT_PUBLIC_SUPABASE_URL}" ]; then
        build_args+=(--build-arg "NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}")
    fi
    if [ -n "${NEXT_PUBLIC_SUPABASE_ANON_KEY}" ]; then
        build_args+=(--build-arg "NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}")
    fi

    # Generate tags
    local tags
    mapfile -t tags < <(generate_tags)

    # Create tag arguments
    for tag in "${tags[@]}"; do
        tag_args+=(-t "${tag}")
    done

    echo -e "${GREEN}Building image with tags:${NC}"
    printf '%s\n' "${tags[@]}" | sed 's/^/  /'

    # Build the image
    docker build \
        "${build_args[@]}" \
        "${tag_args[@]}" \
        --target runner \
        .

    echo -e "${GREEN}Build completed successfully${NC}"

    # Return tags for further processing
    printf '%s\n' "${tags[@]}"
}

# Function to push all tags
push_tags() {
    local tags
    mapfile -t tags < <(generate_tags)

    echo -e "${GREEN}Pushing tags to registry...${NC}"

    for tag in "${tags[@]}"; do
        echo -e "${YELLOW}Pushing: ${tag}${NC}"
        docker push "${tag}"
    done

    echo -e "${GREEN}All tags pushed successfully${NC}"
}

# Function to generate tag metadata
generate_metadata() {
    local tags
    mapfile -t tags < <(generate_tags)

    cat > "./docker-tags-metadata.json" << EOF
{
  "image": "${FULL_IMAGE_NAME}",
  "build_info": {
    "commit": "${GIT_COMMIT}",
    "branch": "${GIT_BRANCH}",
    "tag": "${GIT_TAG}",
    "version": "${VERSION}",
    "build_date": "${BUILD_DATE}",
    "environment": "${ENVIRONMENT:-production}"
  },
  "tags": [
$(printf '    "%s"' "${tags[@]}" | paste -sd ',' -)
  ],
  "tagging_strategy": {
    "commit_based": "Always include commit hash for traceability",
    "branch_based": "Different tags for main, develop, and feature branches",
    "version_based": "Semantic versioning with major/minor tags",
    "date_based": "Date-based tags for archival purposes",
    "environment_based": "Environment-specific tags when specified"
  }
}
EOF

    echo -e "${GREEN}Metadata generated: docker-tags-metadata.json${NC}"
}

# Function to show tagging strategy help
show_help() {
    cat << EOF
${GREEN}Docker Image Tagging Strategy${NC}

This script implements a comprehensive tagging strategy for container images:

${YELLOW}Tag Types:${NC}
1. ${BLUE}Commit-based:${NC} ${IMAGE_NAME}:${GIT_COMMIT}
2. ${BLUE}Branch-based:${NC}
   - main/master → latest, stable
   - develop → develop, beta
   - feature → branch-<name>
3. ${BLUE}Version-based:${NC} v1.2.3, v1.2, v1 (for semantic versions)
4. ${BLUE}Git tag-based:${NC} Exact git tag names
5. ${BLUE}Date-based:${NC} YYYYMMDD-<commit> for archival
6. ${BLUE}Environment-based:${NC} staging, production (when specified)

${YELLOW}Usage:${NC}
  $0 [image_name] [registry] [repository]

${YELLOW}Commands:${NC}
  generate-tags    - Show all tags that would be generated
  build           - Build image with all tags
  push            - Push all tags to registry
  metadata        - Generate metadata file
  help            - Show this help

${YELLOW}Environment Variables:${NC}
  ENVIRONMENT                 - Target environment (staging, production)
  NEXT_PUBLIC_SUPABASE_URL   - Supabase URL for build
  NEXT_PUBLIC_SUPABASE_ANON_KEY - Supabase key for build

${YELLOW}Examples:${NC}
  $0 generate-tags
  $0 build
  ENVIRONMENT=staging $0 build
  $0 push
EOF
}

# Main execution
main() {
    local command=${4:-"generate-tags"}

    case "${command}" in
        "generate-tags")
            generate_tags
            ;;
        "build")
            build_with_tags
            ;;
        "push")
            push_tags
            ;;
        "metadata")
            generate_metadata
            ;;
        "help"|"--help"|"-h")
            show_help
            ;;
        *)
            echo -e "${RED}Unknown command: ${command}${NC}"
            show_help
            exit 1
            ;;
    esac
}

# Run main function
main "$@"
