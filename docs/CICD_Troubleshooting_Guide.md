# CI/CD Troubleshooting Guide

## Quick Reference

### Emergency Contacts
- **DevOps Lead**: Primary CI/CD system owner
- **On-Call Engineer**: 24/7 support for critical issues
- **Security Team**: Security incidents and vulnerabilities

### Emergency Procedures
1. **Production Down**: Execute rollback immediately
2. **Security Breach**: Follow incident response plan
3. **Pipeline Failure**: Check status page and logs
4. **Data Loss**: Activate disaster recovery

## Common Issues and Solutions

### 1. CI Pipeline Failures

#### ESLint Failures

**Symptoms:**
- CI fails at quality-checks job
- ESLint errors in logs
- "Process completed with exit code 1"

**Diagnosis:**
```bash
# Check ESLint locally
npm run lint

# See specific errors
npx eslint src/ --format=detailed
```

**Solutions:**
```bash
# Auto-fix common issues
npm run lint -- --fix

# Fix specific file
npx eslint src/path/to/file.ts --fix

# Check ESLint configuration
cat .eslintrc.json
```

**Prevention:**
- Set up pre-commit hooks
- Use ESLint extension in IDE
- Run lint before pushing code

#### TypeScript Type Errors

**Symptoms:**
- CI fails at quality-checks job
- TypeScript compilation errors
- "Found X errors" in logs

**Diagnosis:**
```bash
# Check types locally
npm run type-check

# Build to see all errors
npm run build
```

**Solutions:**
```bash
# Fix type errors
# Common fixes:
# 1. Add missing type annotations
# 2. Fix import/export types
# 3. Update interface definitions
# 4. Add null checks

# Check specific file
npx tsc --noEmit src/path/to/file.ts
```

**Prevention:**
- Use TypeScript strict mode
- Enable TypeScript in IDE
- Regular type checking during development

#### Test Failures

**Symptoms:**
- Tests fail in unit-tests, integration-tests, or e2e-tests jobs
- "Tests failed" in logs
- Specific test failure messages

**Diagnosis:**
```bash
# Run failing test suite
npm run test -- --testPathPattern=failing-test

# Run with verbose output
npm run test -- --verbose --no-cache

# Run specific test file
npm run test src/__tests__/specific.test.ts
```

**Solutions:**

**Unit Test Failures:**
```bash
# Debug unit tests
npm run test -- --watch
npm run test -- --coverage --verbose

# Common issues:
# 1. Mock not properly configured
# 2. Async test not awaited
# 3. Test data setup issues
# 4. Environment differences
```

**Integration Test Failures:**
```bash
# Run integration tests locally
npm run test:integration

# Check database connection
# Verify API endpoints
# Check test data setup
```

**E2E Test Failures:**
```bash
# Run E2E tests locally
npm run test:e2e

# Debug with headed browser
npm run test:e2e -- --headed

# Check test artifacts
ls test-results/
```

**Prevention:**
- Run tests locally before pushing
- Keep tests isolated and independent
- Use proper test data management

#### Coverage Failures

**Symptoms:**
- CI fails at unit-tests-coverage job
- "Coverage threshold not met" in logs
- Coverage percentage below requirements

**Diagnosis:**
```bash
# Generate coverage report
npm run test:coverage

# Check coverage details
open coverage/lcov-report/index.html

# Check specific file coverage
npm run test:coverage -- --collectCoverageFrom="src/path/to/file.ts"
```

**Solutions:**
```bash
# Add missing tests for uncovered code
# Focus on critical components (90% requirement):
# - src/middleware.ts
# - src/utils/supabase/
# - src/utils/validation/

# Check current coverage
npm run test:coverage -- --verbose

# Test specific component
npm run test -- --collectCoverageFrom="src/components/specific.tsx"
```

**Prevention:**
- Write tests alongside code
- Monitor coverage during development
- Focus on critical path testing

### 2. CD Pipeline Failures

#### Staging Deployment Failure

**Symptoms:**
- CD pipeline fails at deploy-staging job
- Deployment timeout or error
- Health checks fail

**Diagnosis:**
```bash
# Check GitHub Actions logs
# Look for deployment step failures
# Check staging environment status

# Manual health check
curl -f https://staging.myfitnessapp.com/health
```

**Solutions:**
1. **Environment Issues:**
   ```bash
   # Check environment variables
   # Verify Supabase staging project
   # Check DNS and SSL certificates
   ```

2. **Build Issues:**
   ```bash
   # Test build locally
   npm run build
   
   # Check build artifacts
   ls -la .next/
   ```

3. **Dependency Issues:**
   ```bash
   # Clear cache and reinstall
   rm -rf node_modules package-lock.json
   npm install
   ```

**Recovery:**
- Manual rollback if needed
- Fix underlying issue
- Redeploy from working commit

#### Production Deployment Failure

**Symptoms:**
- CD pipeline fails at deploy-production job
- Automatic rollback triggers
- Production health checks fail

**Immediate Actions:**
1. **Verify Rollback Success:**
   ```bash
   # Check rollback job logs
   # Verify production health
   curl -f https://myfitnessapp.com/health
   ```

2. **Assess Impact:**
   - Check user-facing functionality
   - Monitor error rates
   - Review system metrics

3. **Communication:**
   - Notify stakeholders
   - Update status page
   - Prepare incident report

**Investigation:**
```bash
# Check deployment logs
# Review health check failures
# Analyze system metrics
# Check external dependencies
```

**Resolution:**
1. Fix root cause in code
2. Test fix in staging
3. Deploy fix to production
4. Monitor system stability

#### Rollback Failures

**Symptoms:**
- Rollback job fails
- System in inconsistent state
- Manual intervention required

**Emergency Actions:**
1. **Manual Rollback:**
   ```bash
   # Use manual rollback workflow
   # Specify known good version
   # Monitor rollback progress
   ```

2. **System Recovery:**
   - Check database consistency
   - Verify application state
   - Test critical user flows

3. **Escalation:**
   - Contact senior engineers
   - Activate incident response
   - Consider maintenance mode

### 3. Quality Gate Issues

#### Security Vulnerabilities

**Symptoms:**
- Security audit fails
- Critical vulnerabilities found
- CodeQL alerts

**Diagnosis:**
```bash
# Check npm audit
npm audit

# Check for high/critical issues
npm audit --audit-level high

# Generate detailed report
npm audit --json > audit-report.json
```

**Solutions:**
```bash
# Update vulnerable packages
npm audit fix

# Update specific package
npm update package-name

# Check for breaking changes
npm outdated
```

**For Critical Vulnerabilities:**
1. **Immediate Assessment:**
   - Determine exploitability
   - Check if vulnerability affects production
   - Assess risk level

2. **Rapid Response:**
   - Apply security patches
   - Test in staging environment
   - Deploy emergency fix

3. **Follow-up:**
   - Review security practices
   - Update dependency management
   - Document lessons learned

#### Performance Issues

**Symptoms:**
- Pipeline takes longer than 10 minutes
- Jobs timeout
- Resource exhaustion

**Diagnosis:**
```bash
# Check job execution times
# Review resource usage
# Analyze bottlenecks
```

**Solutions:**
1. **Optimize Tests:**
   ```bash
   # Run tests in parallel
   # Reduce test data size
   # Optimize test setup/teardown
   ```

2. **Improve Caching:**
   ```bash
   # Check cache hit rates
   # Optimize cache keys
   # Add missing cache steps
   ```

3. **Resource Optimization:**
   - Use appropriate runner sizes
   - Optimize Docker builds
   - Reduce artifact sizes

### 4. Environment-Specific Issues

#### Staging Environment Problems

**Common Issues:**
- Database connection failures
- API endpoint unavailable
- SSL certificate issues
- Environment variable mismatches

**Diagnosis:**
```bash
# Check Supabase staging project
# Verify environment variables
# Test API endpoints manually
# Check DNS resolution
```

**Solutions:**
```bash
# Update environment configuration
# Restart services if needed
# Check external dependencies
# Verify SSL certificates
```

#### Production Environment Problems

**Critical Response Required:**

1. **Immediate Assessment:**
   - Check system health
   - Monitor error rates
   - Assess user impact

2. **Rapid Response:**
   - Execute rollback if needed
   - Apply hotfixes
   - Scale resources if required

3. **Communication:**
   - Notify users if needed
   - Update stakeholders
   - Document incident

### 5. Notification and Monitoring Issues

#### Telegram Notifications Not Working

**Symptoms:**
- No deployment notifications
- Missing failure alerts
- Bot not responding

**Diagnosis:**
```bash
# Check bot token validity
# Verify chat ID configuration
# Test bot manually
```

**Solutions:**
```bash
# Update bot token in secrets
# Verify chat permissions
# Test notification script locally
node scripts/telegram-notify.js test
```

#### GitHub Status Checks Missing

**Symptoms:**
- PR status checks not appearing
- Workflow status not updating
- Integration issues

**Solutions:**
```bash
# Check workflow permissions
# Verify status check configuration
# Review GitHub API limits
```

## Debugging Workflows

### Local Testing

#### Test CI Pipeline Locally
```bash
# Install act (GitHub Actions local runner)
# https://github.com/nektos/act

# Test specific job
act -j quality-checks
act -j unit-tests

# Test with secrets
act -j deploy-staging --secret-file .secrets
```

#### Validate Workflow Syntax
```bash
# Install workflow validator
npm install -g @github/workflow-validator

# Validate workflow files
workflow-validator .github/workflows/ci.yml
workflow-validator .github/workflows/cd.yml
```

### Log Analysis

#### CI Pipeline Logs
1. **Setup Job:**
   - Dependency installation time
   - Cache hit/miss rates
   - Environment setup issues

2. **Quality Checks:**
   - ESLint rule violations
   - TypeScript compilation errors
   - Security scan results

3. **Test Jobs:**
   - Test execution times
   - Coverage percentages
   - Failure details

4. **Quality Gate:**
   - Overall pipeline status
   - Failure summaries
   - Notification triggers

#### CD Pipeline Logs
1. **Deployment Jobs:**
   - Build process details
   - Environment variable setup
   - Deployment execution steps

2. **Health Checks:**
   - Endpoint response times
   - Database connectivity
   - Service availability

3. **Rollback Jobs:**
   - Rollback trigger reasons
   - Recovery process steps
   - Verification results

### Performance Analysis

#### Pipeline Metrics
```bash
# Check execution times
# Monitor resource usage
# Analyze bottlenecks
# Track success rates
```

#### Optimization Opportunities
1. **Caching Improvements:**
   - Dependency caching
   - Build artifact caching
   - Test result caching

2. **Parallelization:**
   - Test suite optimization
   - Job dependency optimization
   - Resource allocation

3. **Resource Management:**
   - Runner size optimization
   - Timeout adjustments
   - Artifact cleanup

## Prevention Strategies

### Code Quality
- Pre-commit hooks for linting and testing
- IDE integration for real-time feedback
- Regular code reviews and pair programming
- Automated dependency updates

### Testing Strategy
- Test-driven development practices
- Comprehensive test coverage
- Regular test maintenance
- Performance test integration

### Deployment Safety
- Gradual rollout strategies
- Feature flags for risk mitigation
- Comprehensive monitoring
- Automated rollback triggers

### Team Practices
- Regular pipeline health reviews
- Incident post-mortems
- Knowledge sharing sessions
- Documentation maintenance

## Emergency Procedures

### Production Incident Response

1. **Immediate Response (0-5 minutes):**
   - Assess severity and impact
   - Execute rollback if needed
   - Notify incident commander

2. **Short-term Response (5-30 minutes):**
   - Implement temporary fixes
   - Monitor system stability
   - Communicate with stakeholders

3. **Long-term Response (30+ minutes):**
   - Implement permanent fix
   - Conduct root cause analysis
   - Update procedures and documentation

### Escalation Matrix

| Severity | Response Time | Escalation |
|----------|---------------|------------|
| Critical | 5 minutes | On-call engineer → DevOps lead → CTO |
| High | 15 minutes | DevOps lead → Engineering manager |
| Medium | 1 hour | Team lead → DevOps lead |
| Low | Next business day | Team member → Team lead |

### Communication Templates

#### Incident Notification
```
🚨 INCIDENT ALERT 🚨
Severity: [Critical/High/Medium/Low]
System: [Production/Staging]
Impact: [Description of user impact]
Status: [Investigating/Mitigating/Resolved]
ETA: [Expected resolution time]
Updates: [Communication channel]
```

#### Resolution Notification
```
✅ INCIDENT RESOLVED ✅
System: [Production/Staging]
Duration: [Total incident time]
Root Cause: [Brief description]
Resolution: [What was done to fix]
Prevention: [Steps to prevent recurrence]
Post-mortem: [Link to detailed analysis]
```

## Tools and Resources

### Monitoring Tools
- **GitHub Actions**: Workflow execution and logs
- **Codecov**: Code coverage tracking and trends
- **Telegram Bot**: Real-time notifications
- **Custom Scripts**: Performance and pipeline monitoring

### Debugging Tools
- **act**: Local GitHub Actions testing
- **workflow-validator**: Workflow syntax validation
- **npm audit**: Security vulnerability scanning
- **Jest**: Test debugging and coverage analysis

### Documentation
- **CI/CD System Guide**: Comprehensive system documentation
- **API Reference**: Technical API documentation
- **Security Guide**: Security practices and procedures
- **Implementation Guide**: Development and deployment procedures

---

*Last Updated: January 2025*
*Version: 1.0*
*For urgent issues, contact the on-call engineer immediately*
