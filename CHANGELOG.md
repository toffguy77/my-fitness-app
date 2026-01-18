# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **FatSecret API Integration**: Integrated FatSecret API as the primary food database source
  - OAuth 2.0 authentication with automatic token refresh
  - Product search with Russian and English language support
  - Barcode search functionality
  - Automatic fallback to Open Food Facts API when FatSecret is unavailable
  - Product caching in local database to minimize API calls
  - Source attribution for all products (fatsecret, openfoodfacts, user)
  - Comprehensive error handling and logging
  - API usage metrics and monitoring
  - Configuration validation with graceful degradation
  - Support for favorites and meal entry with FatSecret products

### Changed
- Updated product search flow to prioritize: Database → FatSecret → Open Food Facts
- Enhanced product transformation to handle FatSecret's serving size format
- Improved barcode search with multi-source fallback chain
- Updated database schema to support 'fatsecret' as a product source
- Added indexes on products table for faster source-based queries

### Technical Details
- Added `src/config/fatsecret.ts` for centralized configuration
- Added `src/utils/products/fatsecret.ts` for FatSecret API client
- Added `src/utils/products/fatsecret-auth.ts` for OAuth 2.0 token management
- Added `src/utils/products/fatsecret-metrics.ts` for API usage tracking
- Updated `src/utils/products/api.ts` with FatSecret integration
- Updated `src/utils/products/transform.ts` to handle FatSecret food format
- Updated `src/types/products.ts` to include 'fatsecret' source type
- Added comprehensive test suite with 12 property-based tests and unit tests
- All tests passing with 44.21% overall code coverage

### Environment Variables
- `FATSECRET_ENABLED`: Enable/disable FatSecret integration (default: true)
- `FATSECRET_CLIENT_ID`: FatSecret API client ID (required)
- `FATSECRET_CLIENT_SECRET`: FatSecret API client secret (required)
- `FATSECRET_BASE_URL`: FatSecret API base URL (optional)
- `FATSECRET_TIMEOUT`: API request timeout in milliseconds (default: 5000)
- `FATSECRET_MAX_RESULTS`: Maximum results per search (default: 20)
- `FATSECRET_FALLBACK_ENABLED`: Enable fallback to Open Food Facts (default: true)

### Migration Notes
- Database migration applied to support 'fatsecret' source type
- Indexes added for improved query performance
- No breaking changes to existing functionality
- Existing products and user data remain unchanged

## [0.15.0] - Previous Release

See git history for previous changes.
