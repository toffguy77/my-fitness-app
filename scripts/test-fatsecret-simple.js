#!/usr/bin/env node
/**
 * Simple FatSecret API Test Script
 * Run with: node scripts/test-fatsecret-simple.js
 */

// Load environment variables from .env.local
const fs = require('fs')
const path = require('path')

try {
    const envPath = path.join(__dirname, '..', '.env.local')
    const envContent = fs.readFileSync(envPath, 'utf8')
    envContent.split('\n').forEach(line => {
        const match = line.match(/^([^=:#]+)=(.*)$/)
        if (match) {
            const key = match[1].trim()
            const value = match[2].trim().replace(/^["']|["']$/g, '')
            process.env[key] = value
        }
    })
} catch (error) {
    console.warn('Warning: Could not load .env.local file')
}

async function testFatSecretAPI() {
    console.log('🧪 FatSecret API Simple Test\n')
    console.log('='.repeat(60))

    // Check configuration
    const clientId = process.env.FATSECRET_CLIENT_ID
    const clientSecret = process.env.FATSECRET_CLIENT_SECRET
    const enabled = process.env.FATSECRET_ENABLED !== 'false'

    console.log('\n📋 Configuration:')
    console.log(`  Enabled: ${enabled}`)
    console.log(`  Client ID: ${clientId ? '✓ Set (' + clientId.substring(0, 8) + '...)' : '✗ Missing'}`)
    console.log(`  Client Secret: ${clientSecret ? '✓ Set' : '✗ Missing'}`)

    if (!enabled || !clientId || !clientSecret) {
        console.error('\n❌ FatSecret API is not properly configured')
        console.error('Please set FATSECRET_CLIENT_ID and FATSECRET_CLIENT_SECRET in .env.local')
        process.exit(1)
    }

    // Test 1: Authentication
    console.log('\n' + '='.repeat(60))
    console.log('Test 1: OAuth 2.0 Authentication')
    console.log('='.repeat(60))

    try {
        const authString = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

        const response = await fetch('https://oauth.fatsecret.com/connect/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${authString}`
            },
            body: new URLSearchParams({
                grant_type: 'client_credentials',
                scope: 'basic'
            })
        })

        if (!response.ok) {
            throw new Error(`Authentication failed: ${response.status} ${response.statusText}`)
        }

        const data = await response.json()
        console.log('✅ Authentication successful')
        console.log(`   Access Token: ${data.access_token.substring(0, 20)}...`)
        console.log(`   Token Type: ${data.token_type}`)
        console.log(`   Expires In: ${data.expires_in}s`)

        const accessToken = data.access_token

        // Test 2: Search with Russian query
        console.log('\n' + '='.repeat(60))
        console.log('Test 2: Search with Russian query "молоко"')
        console.log('='.repeat(60))

        const startTime1 = Date.now()
        const searchParams1 = new URLSearchParams({
            method: 'foods.search.v4',
            search_expression: 'молоко',
            max_results: '5',
            format: 'json'
        })

        const searchResponse1 = await fetch(`https://platform.fatsecret.com/rest/server.api?${searchParams1}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        })

        const duration1 = Date.now() - startTime1

        if (!searchResponse1.ok) {
            throw new Error(`Search failed: ${searchResponse1.status}`)
        }

        const searchData1 = await searchResponse1.json()
        console.log(`✅ Search completed in ${duration1}ms`)

        if (searchData1.foods && searchData1.foods.food) {
            const foods = Array.isArray(searchData1.foods.food) ? searchData1.foods.food : [searchData1.foods.food]
            console.log(`Found ${foods.length} products:`)

            foods.slice(0, 3).forEach((food, index) => {
                console.log(`\n  ${index + 1}. ${food.food_name}`)
                console.log(`     Brand: ${food.brand_name || 'Generic'}`)
                console.log(`     Type: ${food.food_type}`)
                console.log(`     ID: ${food.food_id}`)
            })
        } else {
            console.log('No products found')
        }

        // Test 3: Search with English query
        console.log('\n' + '='.repeat(60))
        console.log('Test 3: Search with English query "chicken breast"')
        console.log('='.repeat(60))

        const startTime2 = Date.now()
        const searchParams2 = new URLSearchParams({
            method: 'foods.search.v4',
            search_expression: 'chicken breast',
            max_results: '5',
            format: 'json'
        })

        const searchResponse2 = await fetch(`https://platform.fatsecret.com/rest/server.api?${searchParams2}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        })

        const duration2 = Date.now() - startTime2

        if (!searchResponse2.ok) {
            throw new Error(`Search failed: ${searchResponse2.status}`)
        }

        const searchData2 = await searchResponse2.json()
        console.log(`✅ Search completed in ${duration2}ms`)

        if (searchData2.foods && searchData2.foods.food) {
            const foods = Array.isArray(searchData2.foods.food) ? searchData2.foods.food : [searchData2.foods.food]
            console.log(`Found ${foods.length} products:`)

            foods.slice(0, 3).forEach((food, index) => {
                console.log(`\n  ${index + 1}. ${food.food_name}`)
                console.log(`     Brand: ${food.brand_name || 'Generic'}`)
                console.log(`     Type: ${food.food_type}`)
            })
        } else {
            console.log('No products found')
        }

        // Test 4: Performance summary
        console.log('\n' + '='.repeat(60))
        console.log('Performance Summary')
        console.log('='.repeat(60))
        console.log(`  Russian search: ${duration1}ms`)
        console.log(`  English search: ${duration2}ms`)
        console.log(`  Average: ${((duration1 + duration2) / 2).toFixed(0)}ms`)

        if ((duration1 + duration2) / 2 < 3000) {
            console.log('  ✅ Performance meets requirement (<3s)')
        } else {
            console.log('  ⚠️  Performance slower than requirement (>3s)')
        }

        // Summary
        console.log('\n' + '='.repeat(60))
        console.log('✅ All API tests passed!')
        console.log('='.repeat(60))
        console.log('\n📝 Manual Testing Instructions:')
        console.log('1. Start the dev server: npm run dev')
        console.log('2. Navigate to http://localhost:3069')
        console.log('3. Log in or register')
        console.log('4. Go to the nutrition page')
        console.log('5. Test product search with:')
        console.log('   - Russian queries: молоко, курица, хлеб')
        console.log('   - English queries: apple, chicken breast, banana')
        console.log('6. Test barcode search')
        console.log('7. Test adding products to favorites')
        console.log('8. Test adding products to meals')
        console.log('\n📄 See docs/FatSecret_Manual_Testing_Guide.md for detailed test cases')

    } catch (error) {
        console.error('\n❌ Test failed:', error.message)
        process.exit(1)
    }
}

// Run tests
testFatSecretAPI().catch((error) => {
    console.error('\n❌ Test script failed:', error)
    process.exit(1)
})
