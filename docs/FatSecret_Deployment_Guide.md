# FatSecret API Integration - Deployment Guide

## Overview

This guide provides a comprehensive checklist for deploying the FatSecret API integration to production. Follow these steps to ensure a smooth deployment and rollback capability.

## Pre-Deployment Checklist

### 1. Environment Variables

Ensure all required environment variables are configured in your production environment:

#### Required Variables

```bash
# FatSecret API Credentials (REQUIRED)
FATSECRET_ENABLED=true
FATSECRET_CLIENT_ID=<your_production_client_id>
FATSECRET_CLIENT_SECRET=<your_production_client_secret>
```

#### Optional Variables (with defaults)

```bash
# API Configuration
FATSECRET_BASE_URL=https://platform.fatsecret.com/rest/server.api
FATSECRET_TIMEOUT=5000
FATSECRET_MAX_RESULTS=20
FATSECRET_FALLBACK_ENABLED=true
```

#### Verification

```bash
# Verify environment variables are set
echo $FATSECRET_CLIENT_ID
echo $FATSECRET_CLIENT_SECRET
echo $FATSECRET_ENABLED
```

### 2. Database Migration

The FatSecret integration requires database schema updates to support the new product source.

#### Migration Steps

**Option A: Using Supabase Dashboard**

1. Log into your Supabase project dashboard
2. Navigate to SQL Editor
3. Execute the following migration:

```sql
-- Update products table to support 'fatsecret' source
ALTER TABLE products 
  ALTER COLUMN source TYPE VARCHAR(20);

-- Add index for faster source-based queries
CREATE INDEX IF NOT EXISTS idx_products_source ON products(source);

-- Add composite index for source_id lookups
CREATE INDEX IF NOT EXISTS idx_products_source_id ON products(source, source_id);

-- Verify migration
SELECT column_name, data_type, character_maximum_length 
FROM information_schema.columns 
WHERE table_name = 'products' AND column_name = 'source';
```

**Option B: Using Supabase CLI**

```bash
# Create migration file
supabase migration new add_fatsecret_support

# Add the SQL above to the migration file
# Then apply migration
supabase db push
```

#### Migration Verification

```sql
-- Check that indexes were created
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'products' 
AND indexname IN ('idx_products_source', 'idx_products_source_id');

-- Verify source column can accept 'fatsecret'
INSERT INTO products (name, source, source_id, calories_per_100g, protein_per_100g, fats_per_100g, carbs_per_100g)
VALUES ('Test Product', 'fatsecret', 'test_123', 100, 10, 5, 15)
RETURNING id, source;

-- Clean up test data
DELETE FROM products WHERE source_id = 'test_123';
```

### 3. API Credentials Validation

Before deploying, validate your FatSecret API credentials:

```bash
# Test authentication
curl -X POST https://oauth.fatsecret.com/connect/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "Authorization: Basic $(echo -n 'CLIENT_ID:CLIENT_SECRET' | base64)" \
  -d "grant_type=client_credentials&scope=basic"

# Expected response:
# {
#   "access_token": "...",
#   "token_type": "Bearer",
#   "expires_in": 86400
# }
```

### 4. Code Deployment

#### Build and Test

```bash
# Install dependencies
npm install

# Run type checking
npm run type-check

# Run all tests
npm run test:all

# Build production bundle
npm run build
```

#### Deployment Methods

**Docker Deployment:**

```bash
# Build Docker image
docker build -t fitness-app:fatsecret .

# Run container with environment variables
docker run -d \
  -p 3069:3069 \
  -e FATSECRET_ENABLED=true \
  -e FATSECRET_CLIENT_ID=$FATSECRET_CLIENT_ID \
  -e FATSECRET_CLIENT_SECRET=$FATSECRET_CLIENT_SECRET \
  --name fitness-app \
  fitness-app:fatsecret
```

**Docker Compose:**

```bash
# Update .env.production with FatSecret credentials
# Then deploy
docker-compose up -d --build
```

**Direct Deployment:**

```bash
# Build
npm run build

# Start production server
npm start
```

## Deployment Phases

### Phase 1: Canary Deployment (10% of users)

1. **Deploy with feature flag disabled:**
   ```bash
   FATSECRET_ENABLED=false
   ```

2. **Monitor baseline metrics:**
   - API response times
   - Error rates
   - Database query performance

3. **Enable for 10% of users:**
   ```bash
   FATSECRET_ENABLED=true
   ```

4. **Monitor for 24 hours:**
   - FatSecret API call count
   - API response times
   - Fallback activation rate
   - Cache hit rate
   - Error rates

### Phase 2: Gradual Rollout (50% of users)

1. **If Phase 1 successful, increase to 50%**

2. **Monitor for 48 hours:**
   - API usage approaching limits (5000/day)
   - Cost implications
   - User feedback
   - Performance metrics

### Phase 3: Full Rollout (100% of users)

1. **Enable for all users**

2. **Continuous monitoring:**
   - Daily API usage
   - Cache efficiency
   - Fallback frequency
   - User satisfaction

## Monitoring Setup

### Key Metrics to Track

1. **API Usage Metrics:**
   - Total FatSecret API calls per day
   - API response time (p50, p95, p99)
   - Authentication success rate
   - Rate limit warnings

2. **Fallback Metrics:**
   - Fallback activation count
   - Fallback reasons (error types)
   - Open Food Facts API usage

3. **Cache Metrics:**
   - Cache hit rate
   - Database query performance
   - Product save success rate

4. **Error Metrics:**
   - Authentication errors
   - Network timeouts
   - Invalid response formats
   - Rate limit exceeded events

### Logging Configuration

Ensure proper logging levels are set:

```bash
# Production logging
LOG_LEVEL=INFO
NEXT_PUBLIC_LOG_LEVEL=WARN

# For debugging issues
LOG_LEVEL=DEBUG
```

### Alerts to Configure

1. **Critical Alerts:**
   - FatSecret API authentication failures
   - API error rate > 5%
   - Rate limit exceeded

2. **Warning Alerts:**
   - API usage > 80% of daily limit (4000/5000)
   - Fallback activation rate > 20%
   - Cache hit rate < 50%

3. **Info Alerts:**
   - Daily usage summary
   - Performance degradation

## Rollback Procedure

If issues arise, follow this rollback procedure:

### Quick Rollback (Disable FatSecret)

```bash
# Set environment variable
FATSECRET_ENABLED=false

# Restart application
docker-compose restart
# OR
pm2 restart fitness-app
# OR
systemctl restart fitness-app
```

This will immediately switch to Open Food Facts API as the primary source.

### Full Rollback (Revert Code)

1. **Identify last stable version:**
   ```bash
   git log --oneline
   ```

2. **Revert to previous version:**
   ```bash
   git revert <commit-hash>
   # OR
   git checkout <previous-stable-tag>
   ```

3. **Rebuild and deploy:**
   ```bash
   npm run build
   docker-compose up -d --build
   ```

4. **Verify rollback:**
   ```bash
   # Check application logs
   docker-compose logs -f
   
   # Test product search
   curl http://localhost:3069/api/products/search?q=apple
   ```

### Database Rollback

If database migration needs to be reverted:

```sql
-- Remove indexes
DROP INDEX IF EXISTS idx_products_source_id;
DROP INDEX IF EXISTS idx_products_source;

-- Revert source column type (if needed)
-- Note: Only if no 'fatsecret' products exist
ALTER TABLE products 
  ALTER COLUMN source TYPE VARCHAR(15);
```

**Warning:** Only rollback database if no FatSecret products have been cached. Otherwise, data loss may occur.

## Post-Deployment Verification

### 1. Smoke Tests

```bash
# Test product search
curl http://your-domain.com/api/products/search?q=apple

# Test barcode search
curl http://your-domain.com/api/products/barcode/4006040055136

# Check health endpoint (if available)
curl http://your-domain.com/api/health
```

### 2. Manual Testing

1. **Search functionality:**
   - Search for Russian products (e.g., "гречка")
   - Search for English products (e.g., "chicken")
   - Verify results show source indicator

2. **Barcode scanning:**
   - Scan a product barcode
   - Verify product details displayed
   - Check product saved to database

3. **Favorites:**
   - Add FatSecret product to favorites
   - Verify product cached in database
   - Check favorites list displays correctly

4. **Meal entry:**
   - Add FatSecret product to meal
   - Verify KBJU calculated correctly
   - Check usage_count incremented

### 3. Performance Verification

```bash
# Check API response times
curl -w "@curl-format.txt" -o /dev/null -s http://your-domain.com/api/products/search?q=apple

# curl-format.txt:
# time_total: %{time_total}s
# time_namelookup: %{time_namelookup}s
# time_connect: %{time_connect}s
```

Expected response times:
- Database query: < 100ms
- FatSecret API call: < 2s
- Total search response: < 3s

## Troubleshooting

### Common Issues

1. **Authentication Failures:**
   ```
   Error: OAuth failed: 401
   ```
   - Verify CLIENT_ID and CLIENT_SECRET are correct
   - Check credentials haven't expired
   - Ensure base64 encoding is correct

2. **Rate Limit Exceeded:**
   ```
   Error: Rate limit exceeded
   ```
   - Check daily API usage
   - Verify cache is working properly
   - Consider upgrading FatSecret plan

3. **Fallback Always Activating:**
   ```
   Warning: FatSecret API failed, falling back to Open Food Facts
   ```
   - Check FatSecret API status
   - Verify network connectivity
   - Review error logs for specific issues

4. **Products Not Caching:**
   ```
   Warning: Failed to cache FatSecret product
   ```
   - Check database connection
   - Verify products table schema
   - Review database logs

### Debug Mode

Enable debug logging for detailed troubleshooting:

```bash
LOG_LEVEL=DEBUG
NEXT_PUBLIC_LOG_LEVEL=DEBUG
```

Then check logs:
```bash
docker-compose logs -f | grep -i fatsecret
```

## Support and Resources

- **FatSecret Platform:** https://platform.fatsecret.com/
- **FatSecret API Docs:** https://platform.fatsecret.com/api/
- **Open Food Facts API:** https://world.openfoodfacts.org/data
- **Project Documentation:** `docs/README.md`
- **Migration Guide:** `migrations/README.md`

## Checklist Summary

- [ ] Environment variables configured
- [ ] Database migration applied and verified
- [ ] API credentials validated
- [ ] Code built and tested
- [ ] Monitoring and alerts configured
- [ ] Canary deployment (10%) completed
- [ ] Gradual rollout (50%) completed
- [ ] Full rollout (100%) completed
- [ ] Post-deployment verification passed
- [ ] Rollback procedure documented and tested
- [ ] Team trained on monitoring and troubleshooting

## Maintenance

### Weekly Tasks

- [ ] Review API usage metrics
- [ ] Check cache hit rate
- [ ] Review error logs
- [ ] Verify fallback frequency

### Monthly Tasks

- [ ] Analyze API costs vs. benefits
- [ ] Review and optimize cache strategy
- [ ] Update documentation if needed
- [ ] Review FatSecret API updates

### Quarterly Tasks

- [ ] Evaluate FatSecret plan (free vs. paid)
- [ ] Performance optimization review
- [ ] User feedback analysis
- [ ] Consider additional API integrations
