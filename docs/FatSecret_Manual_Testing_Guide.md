# FatSecret Integration Manual Testing Guide

## Overview

This guide provides step-by-step instructions for manually testing the FatSecret API integration with real API calls.

## Prerequisites

- FatSecret API credentials configured in `.env.local`
- Development server running (`npm run dev`)
- Access to the application at `http://localhost:3069`

## Test Scenarios

### 1. Search with Russian Queries (Requirement 2.1, 7.4)

**Test Case 1.1: Search for "молоко" (milk)**
1. Navigate to the nutrition page
2. Click "Add Product" or search field
3. Enter "молоко" in the search box
4. **Expected Results:**
   - Results appear within 3 seconds
   - Products with Russian names are displayed
   - Products show KBJU values per 100g
   - Source indicator shows "fatsecret" for FatSecret products

**Test Case 1.2: Search for "курица" (chicken)**
1. Enter "курица" in the search box
2. **Expected Results:**
   - Multiple chicken products appear
   - Brand names are displayed when available
   - Products are ordered by relevance

**Test Case 1.3: Search for "хлеб" (bread)**
1. Enter "хлеб" in the search box
2. **Expected Results:**
   - Various bread products appear
   - Both generic and branded products are shown

### 2. Search with English Queries (Requirement 2.1, 7.4)

**Test Case 2.1: Search for "apple"**
1. Enter "apple" in the search box
2. **Expected Results:**
   - Apple products appear
   - English names are displayed
   - KBJU values are accurate

**Test Case 2.2: Search for "chicken breast"**
1. Enter "chicken breast" in the search box
2. **Expected Results:**
   - Chicken breast products appear
   - Multiple serving sizes available
   - Nutritional data is complete

**Test Case 2.3: Search for "banana"**
1. Enter "banana" in the search box
2. **Expected Results:**
   - Banana products appear
   - Generic and branded options available

### 3. Barcode Scanning (Requirement 6.1)

**Test Case 3.1: Search by valid barcode**
1. Enter a valid barcode (e.g., "4607065597719" - Russian product)
2. **Expected Results:**
   - Product found immediately
   - Product details displayed
   - Barcode is saved to database

**Test Case 3.2: Search by international barcode**
1. Enter an international barcode (e.g., "0011110485052")
2. **Expected Results:**
   - Product found from FatSecret or Open Food Facts
   - Product cached in database

**Test Case 3.3: Search by invalid barcode**
1. Enter an invalid barcode (e.g., "0000000000000")
2. **Expected Results:**
   - "No products found" message
   - Fallback to Open Food Facts attempted
   - No errors displayed

### 4. Favorites Functionality (Requirement 10.2)

**Test Case 4.1: Add FatSecret product to favorites**
1. Search for a product (e.g., "молоко")
2. Click the favorite/star icon on a FatSecret product
3. **Expected Results:**
   - Product is added to favorites
   - Product is cached in database first
   - Favorite icon changes state

**Test Case 4.2: View favorites list**
1. Navigate to favorites tab
2. **Expected Results:**
   - All favorited products appear
   - Products ordered by most recently added
   - FatSecret products display correctly

**Test Case 4.3: Remove from favorites**
1. Click favorite icon on a favorited product
2. **Expected Results:**
   - Product removed from favorites
   - Product still exists in database cache

### 5. Meal Entry with FatSecret Products (Requirement 9.1)

**Test Case 5.1: Add FatSecret product to meal**
1. Search for a product (e.g., "курица")
2. Select a FatSecret product
3. Enter weight (e.g., 150g)
4. Add to meal
5. **Expected Results:**
   - KBJU calculated correctly for specified weight
   - Product usage recorded in history
   - usage_count incremented
   - Product cached in database

**Test Case 5.2: Add product with custom serving**
1. Search for a product
2. Select a product with multiple servings
3. Choose a custom serving size
4. Add to meal
5. **Expected Results:**
   - KBJU calculated for custom serving
   - Serving size saved correctly

**Test Case 5.3: Verify KBJU calculation**
1. Add a product with known values (e.g., 100g chicken breast)
2. Check calculated KBJU
3. **Expected Results:**
   - Calories match expected value (±1%)
   - Protein, fats, carbs match expected values (±1%)

### 6. Fallback Scenarios (Requirement 2.3)

**Test Case 6.1: FatSecret returns no results**
1. Search for a very specific or rare product
2. **Expected Results:**
   - System automatically queries Open Food Facts
   - Results from Open Food Facts displayed
   - Source indicator shows "openfoodfacts"
   - Fallback logged in console

**Test Case 6.2: Simulate FatSecret API failure**
1. Temporarily disable FatSecret (set `FATSECRET_ENABLED=false`)
2. Restart dev server
3. Search for a product
4. **Expected Results:**
   - System uses Open Food Facts immediately
   - No errors displayed to user
   - Fallback logged

**Test Case 6.3: Both APIs unavailable**
1. Disable both FatSecret and Open Food Facts
2. Search for a product
3. **Expected Results:**
   - Only cached products from database returned
   - Appropriate message if no cached results

## Verification Checklist

### Performance
- [ ] Search results appear within 3 seconds
- [ ] No noticeable lag when adding products
- [ ] Database caching reduces API calls on repeated searches

### Data Quality
- [ ] KBJU values are accurate and reasonable
- [ ] Product names are in correct language
- [ ] Brand names displayed when available
- [ ] Images displayed when available

### Error Handling
- [ ] Invalid searches handled gracefully
- [ ] API failures don't crash the app
- [ ] Fallback mechanism works transparently
- [ ] Error messages are user-friendly

### Logging
- [ ] API requests logged with timestamps
- [ ] Errors logged with context
- [ ] Fallback activations logged
- [ ] Usage metrics tracked

## Console Monitoring

While testing, monitor the browser console for:
- FatSecret API request logs
- Authentication token refresh logs
- Fallback activation logs
- Error messages with context
- Cache hit/miss logs

## Database Verification

After testing, verify in Supabase:
1. Products table contains FatSecret products with source='fatsecret'
2. source_id field populated with FatSecret food_id
3. usage_count incremented for used products
4. Barcodes saved correctly
5. Favorites associations created

## API Usage Monitoring

Check FatSecret dashboard:
- API call count within limits (5000/day for free tier)
- No rate limit errors
- Response times acceptable

## Known Issues

Document any issues found during testing:
- Issue description
- Steps to reproduce
- Expected vs actual behavior
- Screenshots if applicable

## Test Results

Date: _____________
Tester: _____________

| Test Case | Status | Notes |
|-----------|--------|-------|
| 1.1 Russian search "молоко" | ⬜ Pass ⬜ Fail | |
| 1.2 Russian search "курица" | ⬜ Pass ⬜ Fail | |
| 1.3 Russian search "хлеб" | ⬜ Pass ⬜ Fail | |
| 2.1 English search "apple" | ⬜ Pass ⬜ Fail | |
| 2.2 English search "chicken breast" | ⬜ Pass ⬜ Fail | |
| 2.3 English search "banana" | ⬜ Pass ⬜ Fail | |
| 3.1 Valid barcode | ⬜ Pass ⬜ Fail | |
| 3.2 International barcode | ⬜ Pass ⬜ Fail | |
| 3.3 Invalid barcode | ⬜ Pass ⬜ Fail | |
| 4.1 Add to favorites | ⬜ Pass ⬜ Fail | |
| 4.2 View favorites | ⬜ Pass ⬜ Fail | |
| 4.3 Remove from favorites | ⬜ Pass ⬜ Fail | |
| 5.1 Add to meal | ⬜ Pass ⬜ Fail | |
| 5.2 Custom serving | ⬜ Pass ⬜ Fail | |
| 5.3 KBJU calculation | ⬜ Pass ⬜ Fail | |
| 6.1 Fallback on no results | ⬜ Pass ⬜ Fail | |
| 6.2 Fallback on API failure | ⬜ Pass ⬜ Fail | |
| 6.3 Both APIs unavailable | ⬜ Pass ⬜ Fail | |

## Conclusion

Overall Status: ⬜ Pass ⬜ Fail ⬜ Partial

Summary of findings:
_____________________________________________
_____________________________________________
_____________________________________________

Recommendations:
_____________________________________________
_____________________________________________
_____________________________________________
