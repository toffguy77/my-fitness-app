# Rollback Procedures for Coordinator to Curator Migration

## Overview

This document provides step-by-step procedures for rolling back the coordinator to curator migration (v10.0) in case of issues or the need to revert changes.

## When to Use Rollback

Consider rollback in the following scenarios:

- **Data Integrity Issues**: Corruption or loss of data after migration
- **Application Failures**: Critical application functionality broken after migration
- **Performance Degradation**: Significant performance issues introduced by migration
- **Business Requirements**: Change in business requirements necessitating revert
- **Testing Failures**: Critical tests failing after migration in production

## Pre-Rollback Checklist

Before executing rollback, ensure:

- [ ] **Backup Exists**: Verify `migration_backup_v10` schema exists and is intact
- [ ] **Backup Integrity**: Run backup integrity checks
- [ ] **Stakeholder Approval**: Get approval from relevant stakeholders
- [ ] **Maintenance Window**: Schedule appropriate maintenance window
- [ ] **Team Notification**: Notify all relevant teams about rollback
- [ ] **Documentation**: Document the reason for rollback

## Rollback Execution Steps

### Step 1: Verify Backup Integrity

```sql
-- Check if backup exists
SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'migration_backup_v10';

-- Verify backup integrity
SELECT * FROM migration_backup_v10.verify_backup_integrity();
```

All checks should return 'OK' status.

### Step 2: Execute Rollback Script

```sql
-- Execute rollback in Supabase SQL Editor or psql
\i migrations/v10.0_coordinator_to_curator_rollback.sql
```

### Step 3: Verify Rollback Success

```sql
-- Check rollback integrity
SELECT * FROM verify_rollback_integrity();

-- Review rollback report
SELECT * FROM rollback_report ORDER BY rollback_date DESC LIMIT 1;
```

### Step 4: Application-Level Rollback

After database rollback, revert application code:

1. **Git Revert**: Revert all code changes related to curator terminology
2. **Deployment**: Deploy the reverted code to all environments
3. **Cache Clear**: Clear application caches if necessary
4. **Service Restart**: Restart application services

## Rollback Verification

### Database Verification

Verify the following database objects are restored:

- [ ] **Enum**: `user_role` contains 'coordinator' value
- [ ] **Tables**: `coordinator_notes` table exists (not `curator_notes`)
- [ ] **Columns**: `coordinator_id` columns exist in `profiles`, `invite_codes`, `coordinator_notes`
- [ ] **Functions**: `is_coordinator()` and `is_client_coordinator()` functions exist
- [ ] **Indexes**: All indexes use 'coordinator' naming
- [ ] **Policies**: RLS policies reference coordinator functions and columns

### Application Verification

Test the following application functionality:

- [ ] **Authentication**: User login and registration work
- [ ] **Role Assignment**: Coordinator role assignment functions
- [ ] **Invite Codes**: Coordinator invite code creation and usage
- [ ] **Notes**: Coordinator notes creation and viewing
- [ ] **Client Management**: Coordinator-client relationships
- [ ] **API Endpoints**: All `/coordinator/` endpoints work
- [ ] **UI Text**: Interface shows "координатор" in Russian, "coordinator" in English

### Data Integrity Verification

Verify data integrity:

```sql
-- Check user counts by role
SELECT role, COUNT(*) FROM profiles GROUP BY role;

-- Check coordinator-client relationships
SELECT COUNT(*) FROM profiles WHERE coordinator_id IS NOT NULL;

-- Check coordinator notes
SELECT COUNT(*) FROM coordinator_notes;

-- Check invite codes
SELECT COUNT(*) FROM invite_codes WHERE coordinator_id IS NOT NULL;
```

## Post-Rollback Actions

### Immediate Actions (0-2 hours)

1. **Monitor Application**: Watch for errors and performance issues
2. **User Communication**: Notify users about temporary service disruption
3. **Log Analysis**: Review application logs for any issues
4. **Basic Functionality Test**: Test core user flows

### Short-term Actions (2-24 hours)

1. **Comprehensive Testing**: Run full test suite
2. **Performance Monitoring**: Monitor system performance metrics
3. **User Feedback**: Collect and address user feedback
4. **Documentation Update**: Update incident documentation

### Long-term Actions (1-7 days)

1. **Root Cause Analysis**: Investigate why rollback was necessary
2. **Process Improvement**: Update migration procedures based on lessons learned
3. **Planning**: Plan for future migration attempt if applicable
4. **Cleanup**: Clean up rollback artifacts after stability confirmation

## Cleanup After Successful Rollback

After confirming rollback success (recommended wait: 1 week):

```sql
-- Clean up rollback artifacts
DROP FUNCTION IF EXISTS verify_rollback_integrity();
DROP TABLE IF EXISTS rollback_report;

-- Optionally clean up backup (only if certain rollback is permanent)
-- DROP SCHEMA migration_backup_v10 CASCADE;
```

## Troubleshooting Common Issues

### Issue: Backup Schema Not Found

**Symptoms**: Error "migration_backup_v10 schema not found"

**Solution**:
1. Check if backup was created before migration
2. Restore from external backup if available
3. Manual data recovery may be required

### Issue: Rollback Script Fails

**Symptoms**: SQL errors during rollback execution

**Solution**:
1. Check error messages for specific issues
2. Run rollback in smaller chunks
3. Manual intervention may be required for specific objects

### Issue: Application Still Shows Curator

**Symptoms**: UI still shows "curator" after database rollback

**Solution**:
1. Verify code deployment completed
2. Clear application caches
3. Restart application services
4. Check for cached translations

### Issue: RLS Policies Not Working

**Symptoms**: Permission errors after rollback

**Solution**:
1. Verify function restoration completed
2. Check policy definitions match original
3. Test with different user roles
4. Review function permissions

## Emergency Contacts

- **Database Administrator**: [Contact Information]
- **DevOps Team**: [Contact Information]
- **Development Team Lead**: [Contact Information]
- **Product Owner**: [Contact Information]

## Related Documentation

- `BACKUP_PROCEDURES.md` - Backup procedures
- `v10.0_coordinator_to_curator_rollback.sql` - Rollback script
- `v10.0_coordinator_to_curator_backup.sql` - Backup script
- Migration incident post-mortem (if applicable)