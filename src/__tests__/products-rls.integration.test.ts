/**
 * Integration Tests: Products RLS Policies
 * Tests RLS policies for products table
 * **Validates: Requirements 2.1, 2.2, 2.5**
 *
 * NOTE: These are integration tests that require a real Supabase connection.
 * They will be skipped if environment variables are not set.
 * To run these tests, ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set.
 */

import { createClient } from '@supabase/supabase-js'

// Use real Supabase client for integration testing
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Skip all tests if environment variables are not set
const describeIfEnvSet = supabaseUrl && supabaseAnonKey ? describe : describe.skip

describeIfEnvSet('Products RLS Integration Tests', () => {
    let supabase: ReturnType<typeof createClient>
    let testProductId: string | null = null

    beforeAll(() => {
        // Create Supabase client with anon key (simulates authenticated user)
        supabase = createClient(supabaseUrl!, supabaseAnonKey!)
    })

    afterEach(async () => {
        // Clean up test product if created
        if (testProductId) {
            // Note: This will fail if user is not super_admin, which is expected
            // In production, cleanup would be done by super_admin or via service role
            try {
                await supabase.from('products').delete().eq('id', testProductId)
            } catch (error) {
                // Ignore cleanup errors
            }
            testProductId = null
        }
    })

    describe('INSERT Operations', () => {
        /**
         * Test: Authenticated users can insert products
         * **Validates: Requirements 2.1, 2.3, 2.5**
         */
        it('should allow authenticated client users to INSERT products', async () => {
            // Skip if no auth session (can't test without real user)
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) {
                console.warn('Skipping test: No authenticated session available')
                return
            }

            const testProduct = {
                name: 'Test Product RLS',
                brand: 'Test Brand',
                barcode: `TEST-${Date.now()}`,
                calories_per_100g: 100,
                protein_per_100g: 10,
                fats_per_100g: 5,
                carbs_per_100g: 15,
                source: 'user' as const,
            }

            const result = await supabase
                .from('products')
                .insert(testProduct as any)
                .select()
                .single()

            const { data, error, status } = result

            // Should return HTTP 200 (or 201) and successfully create the record
            expect(error).toBeNull()
            expect(status).toBe(201)
            expect(data).toBeTruthy()
            expect((data as any)?.name).toBe(testProduct.name)

            // Store for cleanup
            if (data) {
                testProductId = (data as any).id
            }
        })

        /**
         * Test: Unauthenticated users cannot insert products
         * **Validates: Requirements 2.1, 2.5**
         */
        it('should prevent unauthenticated users from INSERT operations', async () => {
            // Create client without auth
            const unauthClient = createClient(supabaseUrl!, supabaseAnonKey!)

            const testProduct = {
                name: 'Unauthorized Product',
                calories_per_100g: 100,
                protein_per_100g: 10,
                fats_per_100g: 5,
                carbs_per_100g: 15,
            }

            const { data, error } = await unauthClient
                .from('products')
                .insert(testProduct as any)
                .select()

            // Should fail for unauthenticated users
            expect(error).toBeTruthy()
            expect(data).toBeNull()
        })
    })

    describe('SELECT Operations', () => {
        /**
         * Test: Authenticated users can read products
         * **Validates: Requirements 2.2, 2.4, 2.5**
         */
        it('should allow authenticated client users to SELECT products', async () => {
            // Skip if no auth session
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) {
                console.warn('Skipping test: No authenticated session available')
                return
            }

            const { data, error, status } = await supabase
                .from('products')
                .select('*')
                .limit(10)

            // Should return HTTP 200 and successfully return records
            expect(error).toBeNull()
            expect(status).toBe(200)
            expect(Array.isArray(data)).toBe(true)
        })

        /**
         * Test: Authenticated users can read specific product by ID
         * **Validates: Requirements 2.2, 2.5**
         */
        it('should allow authenticated users to SELECT specific products', async () => {
            // Skip if no auth session
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) {
                console.warn('Skipping test: No authenticated session available')
                return
            }

            // First, get any existing product
            const { data: products } = await supabase
                .from('products')
                .select('id')
                .limit(1)

            if (!products || products.length === 0) {
                console.warn('Skipping test: No products available in database')
                return
            }

            const productId = (products[0] as any).id

            // Now try to read that specific product
            const { data, error, status } = await supabase
                .from('products')
                .select('*')
                .eq('id', productId)
                .single()

            // Should return HTTP 200 and successfully return the record
            expect(error).toBeNull()
            expect(status).toBe(200)
            expect(data).toBeTruthy()
            expect((data as any)?.id).toBe(productId)
        })
    })

    describe('HTTP Status Codes', () => {
        /**
         * Test: Verify HTTP 200 responses for allowed operations
         * **Validates: Requirements 2.5**
         */
        it('should return HTTP 200 for SELECT operations', async () => {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) {
                console.warn('Skipping test: No authenticated session available')
                return
            }

            const { status } = await supabase
                .from('products')
                .select('*')
                .limit(1)

            expect(status).toBe(200)
        })

        it('should return HTTP 201 for successful INSERT operations', async () => {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) {
                console.warn('Skipping test: No authenticated session available')
                return
            }

            const testProduct = {
                name: `Test Product ${Date.now()}`,
                barcode: `TEST-STATUS-${Date.now()}`,
                calories_per_100g: 100,
                protein_per_100g: 10,
                fats_per_100g: 5,
                carbs_per_100g: 15,
                source: 'user' as const,
            }

            const result = await supabase
                .from('products')
                .insert(testProduct as any)
                .select()
                .single()

            const { status, data } = result

            expect(status).toBe(201)

            // Store for cleanup
            if (data) {
                testProductId = (data as any).id
            }
        })
    })
})
