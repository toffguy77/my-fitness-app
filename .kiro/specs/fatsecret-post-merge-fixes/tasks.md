# Implementation Plan: FatSecret Post-Merge Fixes

## Overview

Исправление критических проблем после мержа FatSecret интеграции, включая RLS политики, обработку ошибок на клиенте, и конфигурацию API credentials.

## Tasks

- [ ] 1. Create and apply database migration for RLS policies
  - Create migration file `migrations/v11.0_fix_products_rls_for_api.sql`
  - Update products RLS policy to allow API inserts from authenticated users
  - Fix nutrition_targets and daily_logs SELECT policies
  - Add performance indexes
  - Test migration in development environment
  - _Requirements: 1.1, 1.2, 1.3, 3.2, 4.2, 8.1, 8.2, 8.3, 8.4_

- [ ] 2. Update product save logic with duplicate handling
  - [ ] 2.1 Implement duplicate detection by source and source_id
    - Check for existing product before insert
    - Return existing product ID if found
    - _Requirements: 1.4_
  
  - [ ] 2.2 Implement usage_count increment for duplicates
    - Update usage_count when duplicate found
    - Log duplicate handling
    - _Requirements: 1.4_
  
  - [ ] 2.3 Add enhanced error logging for RLS violations
    - Detect 42501 error code
    - Log table, operation, and user context
    - _Requirements: 1.5, 7.1_

- [ ] 3. Fix client-side AbortError handling
  - [ ] 3.1 Update Header component with AbortController
    - Add AbortController to useEffect
    - Cancel requests on unmount
    - Don't log AbortError as error
    - _Requirements: 2.1, 2.3, 9.1, 9.2, 9.5_
  
  - [ ] 3.2 Update SubscriptionBanner component
    - Add AbortController pattern
    - Handle loading states properly
    - _Requirements: 2.4_
  
  - [ ] 3.3 Update Dashboard component
    - Add AbortController for data fetching
    - Implement retry logic (max 2 attempts)
    - _Requirements: 2.5_
  
  - [ ] 3.4 Update GlobalChatWidget component
    - Add AbortController pattern
    - Handle unmount gracefully
    - _Requirements: 2.1, 2.2_

- [ ] 4. Improve FatSecret configuration validation
  - [ ] 4.1 Update getFatSecretConfig with validation
    - Check for missing credentials
    - Log detailed error with context
    - Return disabled config when credentials missing
    - _Requirements: 5.1, 5.2, 5.3, 5.5_
  
  - [ ] 4.2 Add isFatSecretEnabled helper function
    - Simple boolean check for enabled state
    - Use throughout codebase
    - _Requirements: 5.4_
  
  - [ ] 4.3 Update product search to handle disabled FatSecret
    - Check if FatSecret enabled before calling
    - Fall back to OpenFoodFacts immediately if disabled
    - Log fallback reason
    - _Requirements: 5.6_

- [ ] 5. Fix Prometheus metrics error logging
  - Update pushMetric function to check for PROMETHEUS_PUSHGATEWAY_URL
  - Change error logging from ERROR to DEBUG level
  - Add 2-second timeout to prevent hanging
  - Handle AbortError silently
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [ ] 6. Enhance error logging utilities
  - [ ] 6.1 Add logRLSError function
    - Accept table, operation, userId, error details
    - Log with high severity
    - _Requirements: 7.1_
  
  - [ ] 6.2 Add logAPIError function
    - Accept endpoint, method, status, error details
    - Include timestamp and userId
    - _Requirements: 7.2_
  
  - [ ] 6.3 Add handleSupabaseError helper
    - Detect RLS errors (42501, PGRST116)
    - Route to appropriate logging function
    - _Requirements: 7.1, 7.3_

- [ ] 7. Add environment variables documentation
  - Update README.md or .env.example with FatSecret variables
  - Document FATSECRET_CLIENT_ID requirement
  - Document FATSECRET_CLIENT_SECRET requirement
  - Document optional PROMETHEUS_PUSHGATEWAY_URL
  - _Requirements: 5.1, 5.2, 10.2_

- [ ] 8. Checkpoint - Test all fixes
  - Apply database migration
  - Verify products can be saved without RLS errors
  - Test product search with and without FatSecret credentials
  - Navigate between pages quickly to test AbortError handling
  - Verify no ERROR logs for Prometheus pushgateway
  - Check that 406/403 errors are resolved
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Priority: HIGH - These are critical production issues
- All tasks should be completed in order
- Database migration must be tested thoroughly before production deployment
- Backup database before applying migration
- Monitor error logs closely after deployment
