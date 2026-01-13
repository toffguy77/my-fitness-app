# Requirements Document

## Introduction

This specification covers the comprehensive renaming of the "coordinator" role to "curator" throughout the BURCEV fitness application. This change affects database schema, code, user interfaces, documentation, and all user-facing text to better reflect the role's function in the Russian-speaking market.

## Glossary

- **System**: The BURCEV fitness application
- **Curator**: The new name for the role previously called "coordinator" 
- **Client**: Users who work with curators (Premium subscribers)
- **Database_Schema**: PostgreSQL database structure including tables, columns, enums
- **API_Endpoints**: REST API routes and handlers
- **User_Interface**: All user-facing text and navigation elements
- **Codebase**: TypeScript/JavaScript source code including variables, functions, types
- **Documentation**: All markdown files, comments, and technical documentation

## Requirements

### Requirement 1: Database Schema Updates

**User Story:** As a system administrator, I want the database schema to use "curator" terminology, so that the data model accurately reflects the current role naming.

#### Acceptance Criteria

1. WHEN the database migration is applied, THE System SHALL rename all "coordinator" references in table names to "curator"
2. WHEN the database migration is applied, THE System SHALL rename all "coordinator" references in column names to "curator"  
3. WHEN the database migration is applied, THE System SHALL update enum values from "coordinator" to "curator"
4. WHEN the database migration is applied, THE System SHALL update all foreign key constraints to use new naming
5. WHEN the database migration is applied, THE System SHALL preserve all existing data relationships and integrity
6. WHEN the database initiation is applied, THE System SHALL has only "curator" references in table names

### Requirement 2: API Endpoint Updates

**User Story:** As a developer, I want API endpoints to use "curator" terminology, so that the API is consistent with the new role naming.

#### Acceptance Criteria

1. WHEN API endpoints are updated, THE System SHALL change all "/coordinator/" routes to "/curator/"
2. WHEN API endpoints are updated, THE System SHALL update request/response parameter names from "coordinator" to "curator"
3. WHEN API endpoints are updated, THE System SHALL maintain backward compatibility during transition period
4. WHEN API endpoints are updated, THE System SHALL update all API documentation to reflect new endpoints

### Requirement 3: File and Directory Structure Updates

**User Story:** As a developer, I want the file structure to use "curator" terminology, so that the codebase organization matches the role naming.

#### Acceptance Criteria

1. WHEN file structure is updated, THE System SHALL rename directories from "coordinator" to "curator"
2. WHEN file structure is updated, THE System SHALL rename files containing "coordinator" to use "curator"
3. WHEN file structure is updated, THE System SHALL update all import statements to reference new file paths
4. WHEN file structure is updated, THE System SHALL update all routing configurations to use new paths

### Requirement 4: Code Variable and Function Renaming

**User Story:** As a developer, I want code to use "curator" terminology, so that the implementation is consistent with the role naming.

#### Acceptance Criteria

1. WHEN code is updated, THE System SHALL rename all variables containing "coordinator" to use "curator"
2. WHEN code is updated, THE System SHALL rename all function names containing "coordinator" to use "curator"
3. WHEN code is updated, THE System SHALL rename all TypeScript types and interfaces containing "coordinator" to use "curator"
4. WHEN code is updated, THE System SHALL update all component names containing "coordinator" to use "curator"
5. WHEN code is updated, THE System SHALL maintain all existing functionality after renaming

### Requirement 5: User Interface Text Updates

**User Story:** As a user, I want to see "куратор" instead of "координатор" in the interface, so that the terminology is more appropriate for the Russian market.

#### Acceptance Criteria

1. WHEN UI text is updated, THE System SHALL replace all instances of "координатор" with "куратор" in Russian text
2. WHEN UI text is updated, THE System SHALL replace all instances of "coordinator" with "curator" in English text
3. WHEN UI text is updated, THE System SHALL update navigation menus to use new terminology
4. WHEN UI text is updated, THE System SHALL update page titles and headings to use new terminology
5. WHEN UI text is updated, THE System SHALL update form labels and buttons to use new terminology

### Requirement 6: Documentation Updates

**User Story:** As a developer or user, I want documentation to use "curator" terminology, so that all references are consistent with the new role naming.

#### Acceptance Criteria

1. WHEN documentation is updated, THE System SHALL replace all "coordinator" references with "curator" in technical documentation
2. WHEN documentation is updated, THE System SHALL replace all "координатор" references with "куратор" in Russian documentation
3. WHEN documentation is updated, THE System SHALL update API documentation to reflect new endpoint names
4. WHEN documentation is updated, THE System SHALL update database schema documentation with new table/column names
5. WHEN documentation is updated, THE System SHALL update README files and setup instructions

### Requirement 7: Testing and Validation Updates

**User Story:** As a developer, I want all tests to use "curator" terminology, so that the test suite validates the updated system correctly.

#### Acceptance Criteria

1. WHEN tests are updated, THE System SHALL update all test files to use "curator" terminology
2. WHEN tests are updated, THE System SHALL update test data and fixtures to use new role names
3. WHEN tests are updated, THE System SHALL update E2E tests to work with new UI text and routes
4. WHEN tests are updated, THE System SHALL ensure all existing test coverage is maintained
5. WHEN tests are updated, THE System SHALL validate that renamed functionality works correctly

### Requirement 8: Migration Safety and Rollback

**User Story:** As a system administrator, I want safe migration procedures, so that the renaming can be applied and rolled back if needed without data loss.

#### Acceptance Criteria

1. WHEN migration is prepared, THE System SHALL create backup procedures for all affected data
2. WHEN migration is applied, THE System SHALL provide rollback scripts to revert changes if needed
3. WHEN migration is applied, THE System SHALL validate data integrity after each step
4. WHEN migration is applied, THE System SHALL log all changes for audit purposes
5. IF migration fails, THEN THE System SHALL automatically rollback to previous state