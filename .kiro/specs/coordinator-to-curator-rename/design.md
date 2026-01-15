# Design Document: Coordinator to Curator Rename

## Overview

This design outlines the comprehensive renaming of the "coordinator" role to "curator" throughout the BURCEV fitness application. The change affects all layers of the application: database schema, API endpoints, file structure, code variables, user interface text, documentation, and tests.

The renaming follows the established pattern from the previous `v9.0_coach_to_coordinator.sql` migration, ensuring consistency with existing migration practices and maintaining data integrity throughout the process.

## Architecture

The renaming operation is structured as a multi-phase approach to minimize risk and ensure system stability:

### Phase 1: Database Schema Migration
- Update PostgreSQL enum types, table names, column names
- Rename database functions and RLS policies
- Update indexes and constraints
- Preserve all data relationships and integrity

### Phase 2: Backend Code Updates
- Rename API endpoints and route handlers
- Update TypeScript types and interfaces
- Modify server-side functions and utilities
- Update import statements and references

### Phase 3: Frontend Code Updates
- Rename React components and hooks
- Update file and directory structure
- Modify routing configurations
- Update state management and context

### Phase 4: User Interface Text Updates
- Replace Russian text "координатор" with "куратор"
- Replace English text "coordinator" with "curator"
- Update navigation, forms, and page content

### Phase 5: Documentation and Testing
- Update technical documentation
- Modify test files and test data
- Update API documentation
- Verify E2E test compatibility

## Components and Interfaces

### Database Schema Changes

**Tables to Rename:**
- `coordinator_notes` → `curator_notes`

**Columns to Rename:**
- `profiles.coordinator_id` → `profiles.curator_id`
- `invite_codes.coordinator_id` → `invite_codes.curator_id`
- `coordinator_notes.coordinator_id` → `curator_notes.curator_id`

**Enum Updates:**
- `user_role` enum: `'coordinator'` → `'curator'`

**Functions to Rename:**
- `is_coordinator()` → `is_curator()`
- `is_client_coordinator()` → `is_client_curator()`

**Indexes to Rename:**
- `idx_profiles_coordinator_id` → `idx_profiles_curator_id`
- `idx_coordinator_notes_coordinator_date` → `idx_curator_notes_curator_date`
- `idx_coordinator_notes_client_date` → `idx_curator_notes_client_date`
- `idx_invite_codes_coordinator` → `idx_invite_codes_curator`

### API Endpoint Changes

**Route Patterns:**
- `/api/coordinator/*` → `/api/curator/*`
- `/app/coordinator/*` → `/app/curator/*`

**Parameter Names:**
- `coordinatorId` → `curatorId`
- `coordinator_id` → `curator_id`

### File Structure Changes

**Directories:**
- `src/app/coordinator/` → `src/app/curator/`
- `src/app/app/coordinator/` → `src/app/app/curator/`

**Files:**
- Any files containing "coordinator" in the name will be renamed to use "curator"

### Component and Code Changes

**React Components:**
- Component names containing "coordinator" → "curator"
- Props and state variables
- Hook names and custom hooks

**TypeScript Types:**
- Interface names and type definitions
- Generic type parameters
- Utility types

## Data Models

### User Profile Model
```typescript
interface UserProfile {
  id: string
  email: string
  full_name: string
  role: 'client' | 'curator' | 'super_admin'  // Updated enum
  curator_id: string | null                   // Renamed from coordinator_id
  // ... other fields remain unchanged
}
```

### Curator Notes Model
```typescript
interface CuratorNote {                       // Renamed from CoordinatorNote
  id: string
  client_id: string
  curator_id: string                          // Renamed from coordinator_id
  date: string
  content: string
  created_at: string
  updated_at: string
}
```

### Invite Code Model
```typescript
interface InviteCode {
  id: string
  code: string
  curator_id: string                          // Renamed from coordinator_id
  max_uses: number | null
  used_count: number
  expires_at: string | null
  is_active: boolean
  created_at: string
  last_used_at: string | null
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property Reflection

After reviewing all properties identified in the prework analysis, I identified several areas where properties can be consolidated:

- Database schema validation properties (1.1-1.4) can be combined into comprehensive schema validation
- Text replacement properties (5.1, 5.2, 6.1, 6.2, 7.1, 7.2) can be consolidated into comprehensive text replacement validation
- File and code structure properties (3.1-3.4, 4.1-4.4) can be combined into comprehensive codebase validation

The following properties provide unique validation value without redundancy:

### Property 1: Database Schema Migration Integrity
*For any* database migration operation, all coordinator references in schema objects (tables, columns, enums, functions, indexes) should be successfully renamed to curator while preserving all data relationships and referential integrity
**Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5**

### Property 2: API Endpoint Consistency
*For any* API endpoint that previously used coordinator terminology, the renamed curator endpoint should maintain identical functionality and parameter structure
**Validates: Requirements 2.1, 2.2**

### Property 3: File Structure Completeness
*For any* file or directory in the codebase, if it contains "coordinator" in its path or name, it should be successfully renamed to use "curator" with all import references updated
**Validates: Requirements 3.1, 3.2, 3.3, 3.4**

### Property 4: Code Symbol Renaming Completeness
*For any* code symbol (variable, function, type, component) containing "coordinator", it should be renamed to use "curator" while maintaining all functionality and type safety
**Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5**

### Property 5: User Interface Text Replacement Completeness
*For any* user-facing text in the application, all instances of "координатор"/"coordinator" should be replaced with "куратор"/"curator" respectively
**Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5**

### Property 6: Documentation Text Consistency
*For any* documentation file in the project, all references to coordinator terminology should be updated to curator terminology while maintaining document structure and meaning
**Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**

### Property 7: Test Suite Compatibility
*For any* test in the test suite, after renaming operations the test should continue to pass with updated terminology while maintaining the same test coverage percentage
**Validates: Requirements 7.1, 7.2, 7.4, 7.5**

### Property 8: Migration Safety and Rollback Capability
*For any* migration step, if the operation fails, the system should automatically rollback to the previous state with no data loss or corruption
**Validates: Requirements 8.2, 8.3, 8.5**

## Error Handling

### Migration Error Handling
- **Database Migration Failures**: Automatic rollback with detailed error logging
- **File Rename Conflicts**: Backup existing files before renaming operations
- **Import Resolution Errors**: Validate all imports after file structure changes
- **Type Compilation Errors**: Incremental TypeScript compilation validation

### Runtime Error Handling
- **API Endpoint Transition**: Maintain backward compatibility during deployment
- **Route Resolution**: Graceful fallback for old route patterns
- **Component Loading**: Error boundaries for renamed components
- **State Management**: Preserve application state during updates

### Rollback Procedures
- **Database Rollback**: Reverse migration scripts for all schema changes
- **File System Rollback**: Git-based rollback for file structure changes
- **Code Rollback**: Branch-based rollback for code changes
- **Configuration Rollback**: Environment-specific rollback procedures

## Testing Strategy

### Dual Testing Approach
The testing strategy employs both unit tests and property-based tests to ensure comprehensive coverage:

- **Unit tests**: Verify specific examples, edge cases, and error conditions during the renaming process
- **Property tests**: Verify universal properties across all renamed components and validate system-wide consistency

### Property-Based Testing Configuration
- **Testing Library**: Jest with fast-check for property-based testing
- **Test Iterations**: Minimum 100 iterations per property test
- **Test Tags**: Each property test tagged with format: **Feature: coordinator-to-curator-rename, Property {number}: {property_text}**

### Unit Testing Focus
- Database migration validation with specific schema checks
- API endpoint functionality verification
- File system operation validation
- Component rendering with new terminology
- Error handling and rollback procedures

### Integration Testing
- End-to-end user flows with new terminology
- Database-to-UI data flow validation
- Authentication and authorization with renamed roles
- Real-time features (chat) with updated role references

### Performance Testing
- Migration execution time validation
- Application startup time after renaming
- Database query performance with renamed indexes
- Bundle size impact assessment

### Compatibility Testing
- Browser compatibility with renamed routes
- Mobile app compatibility (if applicable)
- API client compatibility during transition
- Third-party integration compatibility
