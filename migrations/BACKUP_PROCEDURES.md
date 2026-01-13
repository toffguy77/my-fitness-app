# Database Backup Procedures for Coordinator to Curator Migration

## Overview

This document outlines the backup procedures for the coordinator to curator migration (v10.0). These procedures ensure data safety and provide rollback capabilities in case of migration issues.

## Pre-Migration Backup

### 1. Execute Backup Script

Before applying the migration, run the backup script:

```sql
-- Execute in Supabase SQL Editor or psql
\i migrations/v10.0_coordinator_to_curator_backup.sql
```

### 2. Verify Backup Integrity

After backup completion, verify the backup integrity:

```sql
-- Check backup integrity
SELECT * FROM migration_backup_v10.verify_backup_integrity();
```

Expected results should show all checks with status 'OK'.

### 3. Review Backup Metadata

Check the backup metadata to ensure all objects were backed up:

```sql
-- View backup summary
SELECT * FROM migration_backup_v10.backup_metadata;
```

## Backup Contents

The backup script creates copies of:

### Tables
- `profiles` (contains coordinator_id column)
- `coordinator_notes` (will be renamed to curator_notes)
- `invite_codes` (contains coordinator_id column)
- `invite_code_usage` (related to invite_codes)

### Database Objects
- **Enum Types**: `user_role` enum values
- **Functions**: `is_coordinator`, `is_client_coordinator`, `use_invite_code`, `create_user_profile`
- **Indexes**: All indexes containing "coordinator" references
- **RLS Policies**: All policies that reference coordinator terminology

### Metadata
- Backup timestamp and version information
- Object counts for verification
- Integrity check functions

## Backup Verification Checklist

Before proceeding with migration, ensure:

- [ ] All tables have been backed up with correct row counts
- [ ] All functions have been saved with their definitions
- [ ] All indexes have been documented
- [ ] All RLS policies have been preserved
- [ ] Backup integrity check passes all tests
- [ ] Backup metadata shows expected object counts

## Storage Location

All backup data is stored in the `migration_backup_v10` schema:

```
migration_backup_v10/
├── profiles_backup              # Table backups
├── coordinator_notes_backup
├── invite_codes_backup
├── invite_code_usage_backup
├── user_role_enum_backup       # Enum values
├── functions_backup            # Function definitions
├── indexes_backup              # Index definitions
├── policies_backup             # RLS policy definitions
├── backup_metadata             # Backup information
└── verify_backup_integrity()   # Verification function
```

## Rollback Preparation

The backup enables complete rollback through:

1. **Data Restoration**: All original table data preserved
2. **Schema Restoration**: Original column names and types preserved
3. **Function Restoration**: Original function definitions saved
4. **Policy Restoration**: Original RLS policies documented

## Security Considerations

- Backup schema contains sensitive user data
- Access should be restricted to database administrators
- Backup should be cleaned up after successful migration verification
- Consider additional external backups for critical production environments

## Cleanup After Successful Migration

After confirming migration success (recommended wait: 1-2 weeks), clean up backup:

```sql
-- WARNING: Only run after confirming migration success
DROP SCHEMA migration_backup_v10 CASCADE;
```

## Emergency Contacts

In case of migration issues:
- Database Administrator: [Contact Information]
- System Administrator: [Contact Information]
- Development Team Lead: [Contact Information]

## Related Files

- `v10.0_coordinator_to_curator_backup.sql` - Backup script
- `v10.0_coordinator_to_curator.sql` - Migration script
- `v10.0_coordinator_to_curator_rollback.sql` - Rollback script