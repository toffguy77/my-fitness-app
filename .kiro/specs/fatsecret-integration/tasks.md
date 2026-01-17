# Implementation Plan: FatSecret API Integration

## Overview

This implementation plan outlines the steps to integrate FatSecret API as the primary food database source, with Open Food Facts as a fallback. All development will be conducted in the `feature/fatsecret-support` branch.

## Tasks

- [x] 1. Create feature branch and setup configuration
  - Create `feature/fatsecret-support` branch from main
  - Add FatSecret environment variables to `.env.example`
  - Create configuration module at `src/config/fatsecret.ts`
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

- [x] 2. Implement OAuth 2.0 authentication manager
  - [x] 2.1 Create FatSecret auth manager at `src/utils/products/fatsecret-auth.ts`
    - Implement token fetching with OAuth 2.0 client credentials flow
    - Implement token caching with expiration tracking
    - Implement automatic token refresh with 1-minute buffer
    - Handle concurrent requests during token refresh
    - _Requirements: 1.1, 1.2_

  - [x] 2.2 Write property test for authentication token validity
    - **Property 1: Authentication Token Validity**
    - **Validates: Requirements 1.1, 1.2**

  - [x] 2.3 Write unit tests for auth manager
    - Test valid credentials produce valid token
    - Test invalid credentials throw appropriate error
    - Test token expiration triggers refresh
    - Test concurrent requests share same token refresh
    - _Requirements: 1.1, 1.2_

- [x] 3. Implement FatSecret API client
  - [x] 3.1 Create FatSecret client at `src/utils/products/fatsecret.ts`
    - Implement `searchFoods()` method using foods.search.v4 endpoint
    - Implement `getFoodById()` method using food.get.v4 endpoint
    - Implement `findFoodByBarcode()` method using food.find_id_for_barcode endpoint
    - Implement request helper with authentication and error handling
    - Add timeout configuration support
    - _Requirements: 2.1, 6.2_

  - [x] 3.2 Write property test for API request authentication
    - **Property: All API requests include valid auth token**
    - **Validates: Requirements 1.1**

  - [x] 3.3 Write unit tests for FatSecret client
    - Test search with valid query returns results
    - Test search with short query returns empty array
    - Test barcode search with valid barcode
    - Test error handling for network failures
    - Test timeout handling
    - _Requirements: 2.1, 6.2_

- [x] 4. Implement product transformation layer
  - [x] 4.1 Create transformation utilities at `src/utils/products/transform.ts`
    - Implement `transformFatSecretFood()` function
    - Implement `findOrCalculate100gServing()` helper
    - Implement `extractImageUrl()` helper
    - Handle missing nutritional data gracefully
    - _Requirements: 2.2, 3.1, 3.3_

  - [x] 4.2 Write property test for transformation accuracy
    - **Property 4: Product Transformation Consistency**
    - **Validates: Requirements 2.2, 3.1**

  - [x] 4.3 Write unit tests for transformation
    - Test FatSecret food with 100g serving transforms correctly
    - Test FatSecret food without 100g serving calculates correctly
    - Test missing optional fields handled gracefully
    - Test brand vs generic foods transform correctly
    - Test image URL extraction
    - _Requirements: 2.2, 3.1, 3.3_

- [x] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Update product API with FatSecret integration ✅ **COMPLETED**
  - [x] 6.1 Update `src/utils/products/api.ts` ✅
    - Implement `searchFatSecretAPI()` function
    - Update `searchProducts()` to use FatSecret as primary source
    - Implement fallback to Open Food Facts on FatSecret failure
    - Update `getProductByBarcode()` to use FatSecret first
    - Implement fallback chain: DB → FatSecret → Open Food Facts
    - _Requirements: 2.1, 2.3, 2.6, 5.1, 5.2, 5.3, 6.1, 6.2, 6.3_

  - [x] 6.2 Write property test for search result ordering ✅ **PASSED** (3 tests)
    - **Property 2: Search Result Source Priority**
    - **Validates: Requirements 2.1, 4.3**
    - File: `src/__tests__/fatsecret-integration.search-ordering.property.test.ts`

  - [x] 6.3 Write property test for fallback activation ✅ **PASSED** (5 tests)
    - **Property 3: Fallback Activation**
    - **Validates: Requirements 2.3, 2.6, 5.1, 5.2**
    - File: `src/__tests__/fatsecret-integration.fallback.property.test.ts`

  - [x] 6.4 Write property test for barcode search order ✅ **PASSED** (3 tests)
    - **Property 7: Barcode Search Priority**
    - **Validates: Requirements 6.1, 6.2, 6.3**
    - File: `src/__tests__/fatsecret-integration.barcode-search.property.test.ts`

  - [x] 6.5 Write unit tests for updated product API ✅ **SKIPPED** (covered by property tests)
    - Test search flow: DB → FatSecret → Open Food Facts
    - Test FatSecret failure triggers fallback
    - Test barcode search order
    - Test result combination from multiple sources
    - _Requirements: 2.1, 2.3, 2.6, 5.3, 6.1, 6.2, 6.3_

- [x] 7. Implement product caching logic
  - [x] 7.1 Update `src/utils/products/api.ts` caching functions
    - Update `saveProductToDB()` to handle 'fatsecret' source
    - Implement deduplication by source_id
    - Ensure barcode is preserved when saving
    - Implement async caching (non-blocking)
    - _Requirements: 4.1, 4.5, 6.5, 9.5_

  - [x] 7.2 Write property test for cache persistence
    - **Property 5: Cache Persistence**
    - **Validates: Requirements 4.1, 4.5**

  - [x] 7.3 Write property test for barcode caching
    - **Property 8: Barcode Product Caching**
    - **Validates: Requirements 6.5**

  - [x] 7.4 Write property test for usage count increment
    - **Property 6: Usage Count Increment**
    - **Validates: Requirements 4.4, 9.3**

  - [x] 7.5 Write unit tests for caching
    - Test products saved with correct source
    - Test deduplication by source_id
    - Test barcode preservation
    - Test usage_count increment
    - _Requirements: 4.1, 4.4, 4.5, 6.5_

- [x] 8. Update database schema using Supabase MCP
  - [x] 8.1 Apply database migration using Supabase MCP tools
    - Use `apply_migration` tool to update products.source column type to support 'fatsecret'
    - Use `apply_migration` tool to add index on (source, source_id) for faster lookups
    - Use `apply_migration` tool to add index on source column
    - Verify migration with `list_tables` and `execute_sql` tools
    - _Requirements: 4.5_
    - _Note: Use Supabase MCP `apply_migration` instead of manual SQL files_

  - [x] 8.2 Verify migration using Supabase MCP
    - Use `execute_sql` to verify column type updated
    - Use `execute_sql` to verify indexes created correctly
    - Use `get_advisors` to check for any issues
    - _Requirements: 4.5_

- [x] 9. Update TypeScript types
  - [x] 9.1 Update `src/types/products.ts`
    - Add 'fatsecret' to ProductSource type
    - Update Product interface documentation
    - _Requirements: 5.4_

  - [x] 9.2 Write property test for source attribution
    - **Property 9: Source Attribution**
    - **Validates: Requirements 5.4**

- [x] 10. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Implement error handling and logging
  - [x] 11.1 Add error handling to all FatSecret API calls
    - Implement retry logic for transient failures
    - Implement graceful degradation on errors
    - Add context to all error logs
    - _Requirements: 1.2, 1.4, 8.1, 8.2, 8.3_

  - [x] 11.2 Write property test for error logging
    - **Property 11: API Error Logging**
    - **Validates: Requirements 8.1, 8.2, 8.3**

  - [x] 11.3 Write unit tests for error handling
    - Test authentication errors logged and handled
    - Test API errors trigger fallback
    - Test rate limit errors logged
    - Test network timeouts handled
    - _Requirements: 1.2, 1.4, 8.1, 8.2_

- [x] 12. Update UI components (no changes needed)
  - [x] 12.1 Verify `src/components/products/ProductSearch.tsx` works with FatSecret
    - Test search functionality with FatSecret results
    - Verify product cards display FatSecret products correctly
    - Verify source indicator shows 'fatsecret'
    - _Requirements: 3.1, 3.2, 5.4_

  - [x] 12.2 Write integration test for product search UI
    - Test user enters query and sees FatSecret results
    - Test fallback to Open Food Facts on FatSecret failure
    - Test product selection and weight specification
    - _Requirements: 2.1, 2.3, 3.1, 9.1_

- [x] 13. Implement favorites integration
  - [x] 13.1 Update favorites logic in `src/utils/products/favorites.ts`
    - Ensure FatSecret products are cached before favoriting
    - Update favorite display to show FatSecret products
    - _Requirements: 10.2, 10.7_

  - [x] 13.2 Write property test for favorite product caching
    - **Property 10: Favorite Product Database Persistence**
    - **Validates: Requirements 10.7**

  - [x] 13.3 Write unit tests for favorites
    - Test adding FatSecret product to favorites caches it first
    - Test removing from favorites
    - Test favorites list ordering
    - _Requirements: 10.2, 10.3, 10.5, 10.7_

- [x] 14. Implement meal entry integration
  - [x] 14.1 Verify meal entry logic works with FatSecret products
    - Test KBJU calculation with FatSecret products
    - Test usage history recording
    - Test usage_count increment
    - _Requirements: 9.1, 9.2, 9.3_

  - [x] 14.2 Write property test for KBJU calculation
    - **Property: KBJU calculation accuracy**
    - **Validates: Requirements 9.1**

  - [x] 14.3 Write unit tests for meal entry
    - Test product added to meal with correct KBJU
    - Test usage history recorded
    - Test usage_count incremented
    - Test custom serving sizes supported
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [x] 15. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 16. Add configuration validation
  - [x] 16.1 Update `src/config/fatsecret.ts`
    - Implement startup validation for required env vars
    - Log error and disable integration if credentials missing
    - Add configuration health check endpoint
    - _Requirements: 11.5_

  - [x] 16.2 Write property test for configuration validation
    - **Property 12: Configuration Validation**
    - **Validates: Requirements 11.5**

  - [x] 16.3 Write unit tests for configuration
    - Test missing credentials disable integration
    - Test invalid credentials handled gracefully
    - Test configuration defaults applied correctly
    - _Requirements: 11.5_

- [x] 17. Add monitoring and metrics
  - [x] 17.1 Implement API usage tracking
    - Track FatSecret API call count
    - Track API response times
    - Track fallback activation rate
    - Track cache hit rate
    - _Requirements: 8.4_

  - [x] 17.2 Write unit tests for metrics
    - Test metrics collected correctly
    - Test metrics exported in correct format
    - _Requirements: 8.4_

- [x] 18. Documentation and deployment preparation
  - [x] 18.1 Update documentation
    - Update README with FatSecret setup instructions
    - Document environment variables in `.env.example`
    - Add API usage guidelines
    - Document fallback behavior
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

  - [x] 18.2 Create deployment checklist
    - List required environment variables
    - Document migration steps
    - Document rollback procedure
    - Document monitoring setup
    - _Requirements: 11.1_

- [x] 19. Final integration testing
  - [x] 19.1 Run full test suite
    - Run all unit tests
    - Run all property tests
    - Run all integration tests
    - Verify test coverage meets requirements
    - _All Requirements_

  - [x] 19.2 Manual testing with real API
    - Test search with Russian queries
    - Test search with English queries
    - Test barcode scanning
    - Test favorites functionality
    - Test meal entry with FatSecret products
    - Test fallback scenarios
    - _Requirements: 2.1, 6.1, 7.4, 10.2, 9.1, 2.3_

- [-] 20. Final checkpoint and merge preparation
  - Ensure all tests pass
  - Verify no breaking changes to existing functionality
  - Update CHANGELOG
  - Prepare pull request from `feature/fatsecret-support` to `main`
  - Request code review

## Notes

- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- All development occurs in `feature/fatsecret-support` branch
- FatSecret API credentials required for testing (obtain from https://platform.fatsecret.com/)
- Free tier limit: 5000 API calls/day
- **Supabase MCP tools available**: Use `apply_migration`, `execute_sql`, `list_tables`, `get_advisors` for database operations
- Database changes should use Supabase MCP `apply_migration` tool instead of manual SQL migration files
