# Implementation Plan: FatSecret Post-Merge Fixes

## Overview

Исправление критических проблем после мержа FatSecret интеграции, включая RLS политики, обработку ошибок на клиенте, и конфигурацию API credentials.

## Tasks

- [x] 1. Create and apply database migration for RLS policies
  - Migration file `migrations/fix_products_rls.sql` created and applied to production
  - All 4 RLS policies successfully created:
    * "Authenticated users can insert products" - FOR INSERT
    * "Authenticated users can read products" - FOR SELECT  
    * "Only super_admin can update products" - FOR UPDATE
    * "Only super_admin can delete products" - FOR DELETE
  - _Requirements: 1.1, 1.2, 1.3, 3.2, 4.2, 8.1, 8.2, 8.3, 8.4_
  - **Status: COMPLETED** - Migration applied to production database on 2025-01-24

- [x] 2. Update product save logic with duplicate handling
  - [x] 2.1 Implement duplicate detection by source and source_id
    - Already implemented in `src/utils/products/api.ts` (saveProductToDB function)
    - Checks for existing product by source_id and source, then by barcode
    - Returns existing product ID if found
    - _Requirements: 1.4_
    - **Status: COMPLETED**
  
  - [x] 2.2 Implement usage_count increment for duplicates
    - Current implementation does NOT increment usage_count when duplicate found
    - Need to add usage_count increment logic in saveProductToDB
    - _Requirements: 1.4_
  
  - [x] 2.3 Add enhanced error logging for RLS violations
    - Need to detect 42501 error code in saveProductToDB
    - Need to log table, operation, and user context
    - _Requirements: 1.5, 7.1_

- [x] 3. Fix client-side AbortError handling
  - [x] 3.1 Update Header component with AbortController
    - Already uses useAbortController hook
    - Properly handles request cancellation on unmount
    - _Requirements: 2.1, 2.3, 9.1, 9.2, 9.5_
    - **Status: COMPLETED**
  
  - [x] 3.2 Update SubscriptionBanner component
    - Already uses useAbortController hook
    - Properly handles loading states
    - _Requirements: 2.4_
    - **Status: COMPLETED**
  
  - [x] 3.3 Update Dashboard component
    - Does NOT use AbortController for data fetching
    - Need to add useAbortController hook
    - Need to implement retry logic (max 2 attempts)
    - _Requirements: 2.5_
  
  - [x] 3.4 Update GlobalChatWidget component
    - Already uses useAbortController hook
    - Handles unmount gracefully
    - _Requirements: 2.1, 2.2_
    - **Status: COMPLETED**

- [x] 4. Improve FatSecret configuration validation
  - [x] 4.1 Update getFatSecretConfig with validation
    - Already checks for missing credentials
    - Already logs detailed error with context
    - Already returns disabled config when credentials missing
    - _Requirements: 5.1, 5.2, 5.3, 5.5_
    - **Status: COMPLETED**
  
  - [x] 4.2 Add isFatSecretEnabled helper function
    - Need to add simple boolean check function
    - Export from src/config/fatsecret.ts
    - _Requirements: 5.4_
  
  - [x] 4.3 Update product search to handle disabled FatSecret
    - Already checks if FatSecret enabled before calling
    - Already falls back to OpenFoodFacts when disabled
    - Already logs fallback reason
    - _Requirements: 5.6_
    - **Status: COMPLETED**

- [x] 5. Fix Prometheus metrics error logging
  - Already implemented in `src/utils/metrics/prometheus-collector.ts`
  - Checks for PROMETHEUS_PUSHGATEWAY_URL
  - Uses silent failure mode (no ERROR logs)
  - Has timeout and retry mechanism
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_
  - **Status: COMPLETED**

- [x] 6. Enhance error logging utilities
  - [x] 6.1 Add logRLSError function
    - Add to src/utils/logger.ts
    - Accept table, operation, userId, error details
    - Log with high severity
    - _Requirements: 7.1_
  
  - [x] 6.2 Add logAPIError function
    - Add to src/utils/logger.ts
    - Accept endpoint, method, status, error details
    - Include timestamp and userId
    - _Requirements: 7.2_
  
  - [x] 6.3 Add handleSupabaseError helper
    - Add to src/utils/logger.ts
    - Detect RLS errors (42501, PGRST116)
    - Route to appropriate logging function
    - _Requirements: 7.1, 7.3_

- [x] 7. Add environment variables documentation
  - Update env.example with FatSecret variables
  - Document FATSECRET_CLIENT_ID requirement
  - Document FATSECRET_CLIENT_SECRET requirement
  - Document optional PROMETHEUS_PUSHGATEWAY_URL
  - _Requirements: 5.1, 5.2, 10.2_

- [x] 8. Checkpoint - Test all fixes
  - Verify products can be saved without RLS errors
  - Test product search with and without FatSecret credentials
  - Navigate between pages quickly to test AbortError handling
  - Verify no ERROR logs for Prometheus pushgateway
  - Check that 406/403 errors are resolved
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Priority: HIGH - These are critical production issues
- Many tasks are already completed - focus on remaining items
- Database migration already exists and is ready to apply
- Most client-side AbortError handling is already implemented
- FatSecret configuration validation is already robust
- Prometheus metrics already has proper error handling
