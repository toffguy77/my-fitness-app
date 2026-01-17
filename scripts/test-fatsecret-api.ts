#!/usr/bin/env ts-node
/**
 * FatSecret API Manual Test Script
 *
 * This script tests the FatSecret API integration with real API calls.
 * Run with: npx ts-node scripts/test-fatsecret-api.ts
 */

import { getFatSecretConfig } from '../src/config/fatsecret'
import { FatSecretClient } from '../src/utils/products/fatsecret'
import { transformFatSecretFood } from '../src/utils/products/transform'

async function testFatSecretAPI() {
    console.log('🧪 FatSecret API Manual Test\n')
    console.log('='.repeat(60))

    // Check configuration
    const config = getFatSecretConfig()
    console.log('\n📋 Configuration:')
    console.log(`  Enabled: ${config.enabled}`)
    console.log(`  Client ID: ${config.clientId ? '✓ Set' : '✗ Missing'}`)
    console.log(`  Client Secret: ${config.clientSecret ? '✓ Set' : '✗ Missing'}`)
    console.log(`  Base URL: ${config.baseUrl}`)
    console.log(`  Timeout: ${config.timeout}ms`)
    console.log(`  Max Results: ${config.maxResults}`)
    console.log(`  Fallback Enabled: ${config.fallbackEnabled}`)

    if (!config.enabled || !config.clientId || !config.clientSecret) {
        console.error('\n❌ FatSecret API is not properly configured')
        console.error('Please set FATSECRET_CLIENT_ID and FATSECRET_CLIENT_SECRET in .env.local')
        process.exit(1)
    }

    const client = new FatSecretClient(config)

    // Test 1: Authentication (implicit via first API call)
    console.log('\n' + '='.repeat(60))
    console.log('Test 1: Authentication')
    console.log('='.repeat(60))
    console.log('✅ Authentication will be tested via first API call')

    // Test 2: Search with Russian query
    console.log('\n' + '='.repeat(60))
    console.log('Test 2: Search with Russian query "молоко"')
    console.log('='.repeat(60))
    try {
        const startTime = Date.now()
        const results = await client.searchFoods('молоко', 5, 0)
        const duration = Date.now() - startTime

        console.log(`✅ Search completed in ${duration}ms`)
        console.log(`Found ${results.length} products:`)

        results.slice(0, 3).forEach((food, index) => {
            console.log(`\n  ${index + 1}. ${food.food_name}`)
            console.log(`     Brand: ${food.brand_name || 'Generic'}`)
            console.log(`     Type: ${food.food_type}`)
            console.log(`     ID: ${food.food_id}`)

            // Transform and show KBJU
            const product = transformFatSecretFood(food)
            console.log(`     KBJU per 100g: ${product.calories_per_100g}kcal, P:${product.protein_per_100g}g, F:${product.fats_per_100g}g, C:${product.carbs_per_100g}g`)
        })
    } catch (error) {
        console.error('❌ Russian search failed:', error)
    }

    // Test 3: Search with English query
    console.log('\n' + '='.repeat(60))
    console.log('Test 3: Search with English query "chicken breast"')
    console.log('='.repeat(60))
    try {
        const startTime = Date.now()
        const results = await client.searchFoods('chicken breast', 5, 0)
        const duration = Date.now() - startTime

        console.log(`✅ Search completed in ${duration}ms`)
        console.log(`Found ${results.length} products:`)

        results.slice(0, 3).forEach((food, index) => {
            console.log(`\n  ${index + 1}. ${food.food_name}`)
            console.log(`     Brand: ${food.brand_name || 'Generic'}`)
            console.log(`     Type: ${food.food_type}`)

            const product = transformFatSecretFood(food)
            console.log(`     KBJU per 100g: ${product.calories_per_100g}kcal, P:${product.protein_per_100g}g, F:${product.fats_per_100g}g, C:${product.carbs_per_100g}g`)
        })
    } catch (error) {
        console.error('❌ English search failed:', error)
    }

    // Test 4: Get food by ID
    console.log('\n' + '='.repeat(60))
    console.log('Test 4: Get food by ID')
    console.log('='.repeat(60))
    try {
        // Use a known FatSecret food ID (generic milk)
        const foodId = '33691' // Generic whole milk
        const food = await client.getFoodById(foodId)

        if (food) {
            console.log(`✅ Food retrieved successfully`)
            console.log(`   Name: ${food.food_name}`)
            console.log(`   Brand: ${food.brand_name || 'Generic'}`)
            const servings = Array.isArray(food.servings.serving) ? food.servings.serving : [food.servings.serving]
            console.log(`   Servings: ${servings.length}`)

            const product = transformFatSecretFood(food)
            console.log(`   KBJU per 100g: ${product.calories_per_100g}kcal, P:${product.protein_per_100g}g, F:${product.fats_per_100g}g, C:${product.carbs_per_100g}g`)
        } else {
            console.log('⚠️  Food not found')
        }
    } catch (error) {
        console.error('❌ Get food by ID failed:', error)
    }

    // Test 5: Barcode search
    console.log('\n' + '='.repeat(60))
    console.log('Test 5: Barcode search')
    console.log('='.repeat(60))
    try {
        // Try a common barcode (Coca-Cola)
        const barcode = '5449000000996'
        console.log(`Searching for barcode: ${barcode}`)

        const food = await client.findFoodByBarcode(barcode)

        if (food) {
            console.log(`✅ Product found by barcode`)
            console.log(`   Name: ${food.food_name}`)
            console.log(`   Brand: ${food.brand_name || 'Generic'}`)

            const product = transformFatSecretFood(food)
            console.log(`   KBJU per 100g: ${product.calories_per_100g}kcal, P:${product.protein_per_100g}g, F:${product.fats_per_100g}g, C:${product.carbs_per_100g}g`)
        } else {
            console.log('⚠️  Product not found by barcode (this is normal for many barcodes)')
        }
    } catch (error) {
        console.error('❌ Barcode search failed:', error)
    }

    // Test 6: Performance test
    console.log('\n' + '='.repeat(60))
    console.log('Test 6: Performance test (5 consecutive searches)')
    console.log('='.repeat(60))
    try {
        const queries = ['apple', 'banana', 'bread', 'milk', 'egg']
        const times: number[] = []

        for (const query of queries) {
            const startTime = Date.now()
            await client.searchFoods(query, 5, 0)
            const duration = Date.now() - startTime
            times.push(duration)
            console.log(`  "${query}": ${duration}ms`)
        }

        const avgTime = times.reduce((a, b) => a + b, 0) / times.length
        const maxTime = Math.max(...times)
        const minTime = Math.min(...times)

        console.log(`\n  Average: ${avgTime.toFixed(0)}ms`)
        console.log(`  Min: ${minTime}ms`)
        console.log(`  Max: ${maxTime}ms`)

        if (avgTime < 3000) {
            console.log('  ✅ Performance meets requirement (<3s)')
        } else {
            console.log('  ⚠️  Performance slower than requirement (>3s)')
        }
    } catch (error) {
        console.error('❌ Performance test failed:', error)
    }

    // Summary
    console.log('\n' + '='.repeat(60))
    console.log('✅ All tests completed!')
    console.log('='.repeat(60))
    console.log('\nNext steps:')
    console.log('1. Start the dev server: npm run dev')
    console.log('2. Navigate to http://localhost:3069')
    console.log('3. Follow the manual testing guide in docs/FatSecret_Manual_Testing_Guide.md')
    console.log('4. Test the UI with real user interactions')
}

// Run tests
testFatSecretAPI().catch((error) => {
    console.error('\n❌ Test script failed:', error)
    process.exit(1)
})
