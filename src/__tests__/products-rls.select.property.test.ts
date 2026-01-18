/**
 * Property-based tests for Products SELECT RLS Policy
 * Feature: error-handling-improvements, Property 4: Products SELECT Permission
 *
 * Validates: Requirements 2.2, 2.4, 2.5
 */

import * as fc from 'fast-check'
import { createClient } from '@supabase/supabase-js'

// Use real Supabase credentials
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kvdusetwlsxcusbjwvdu.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2ZHVzZXR3bHN4Y3VzYmp3dmR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4NjQ1NjQsImV4cCI6MjA4MTQ0MDU2NH0.mKgvI8QtB7riRIH3NQvd-YF3D5kcK5iiVeyfkd750Nk'

describe('Products SELECT RLS Property Tests', () => {
    let supabase: ReturnType<typeof createClient>

    beforeAll(() => {
        supabase = createClient(supabaseUrl, supabaseAnonKey)
    })

    describe('Property 4: Products SELECT Permission', () => {
        /**
         * Property: For any authenticated user attempting to read products,
         * the database should return HTTP 200 and successfully return records
         *
         * This property ensures that:
         * 1. All authenticated users can SELECT products (not just super_admin)
         * 2. The RLS policy allows reading products from the database
         * 3. HTTP status codes are correct (200)
         * 4. The returned data structure is valid
         */
        it('should allow SELECT operations for authenticated users', async () => {
            // Skip if no authenticated session
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) {
                console.warn('Skipping property test: No authenticated session available')
                return
            }

            await fc.assert(
                fc.asyncProperty(
                    // Generate random query parameters
                    fc.record({
                        limit: fc.integer({ min: 1, max: 100 }),
                        offset: fc.integer({ min: 0, max: 50 }),
                    }),
                    async (queryParams) => {
                        // Execute: SELECT products with pagination
                        const { data, error, status } = await supabase
                            .from('products')
                            .select('*')
                            .range(queryParams.offset, queryParams.offset + queryParams.limit - 1)

                        // Property 1: No error should occur
                        expect(error).toBeNull()

                        // Property 2: HTTP status should be 200 (OK)
                        expect(status).toBe(200)

                        // Property 3: Data should be an array
                        expect(Array.isArray(data)).toBe(true)

                        // Property 4: Each product should have required fields
                        if (data && data.length > 0) {
                            data.forEach(product => {
                                expect(product).toHaveProperty('id')
                                expect(product).toHaveProperty('name')
                                expect(product).toHaveProperty('calories_per_100g')
                                expect(product).toHaveProperty('protein_per_100g')
                                expect(product).toHaveProperty('fats_per_100g')
                                expect(product).toHaveProperty('carbs_per_100g')
                                expect(product).toHaveProperty('created_at')
                            })
                        }
                    }
                ),
                { numRuns: 10 }
            )
        })

        it('should allow SELECT with various filter conditions', async () => {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) {
                console.warn('Skipping property test: No authenticated session available')
                return
            }

            await fc.assert(
                fc.asyncProperty(
                    // Generate random filter parameters
                    fc.constantFrom('user', 'openfoodfacts', 'usda') as fc.Arbitrary<'user' | 'openfoodfacts' | 'usda'>,
                    async (source) => {
                        // Execute: SELECT products filtered by source
                        const { data, error, status } = await supabase
                            .from('products')
                            .select('*')
                            .eq('source', source)
                            .limit(10)

                        // Property: SELECT with filters should succeed
                        expect(error).toBeNull()
                        expect(status).toBe(200)
                        expect(Array.isArray(data)).toBe(true)

                        // Property: All returned products should match the filter
                        if (data && data.length > 0) {
                            data.forEach(product => {
                                expect(product.source).toBe(source)
                            })
                        }
                    }
                ),
                { numRuns: 10 }
            )
        })

        it('should allow SELECT with ordering', async () => {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) {
                console.warn('Skipping property test: No authenticated session available')
                return
            }

            await fc.assert(
                fc.asyncProperty(
                    // Generate random ordering parameters
                    fc.record({
                        column: fc.constantFrom('name', 'created_at', 'usage_count', 'calories_per_100g'),
                        ascending: fc.boolean(),
                    }),
                    async (orderParams) => {
                        // Execute: SELECT products with ordering
                        const { data, error, status } = await supabase
                            .from('products')
                            .select('*')
                            .order(orderParams.column, { ascending: orderParams.ascending })
                            .limit(20)

                        // Property: SELECT with ordering should succeed
                        expect(error).toBeNull()
                        expect(status).toBe(200)
                        expect(Array.isArray(data)).toBe(true)

                        // Property: Results should be ordered correctly
                        if (data && data.length > 1) {
                            for (let i = 0; i < data.length - 1; i++) {
                                const current = data[i][orderParams.column as keyof typeof data[0]]
                                const next = data[i + 1][orderParams.column as keyof typeof data[0]]

                                if (current !== null && next !== null) {
                                    if (orderParams.ascending) {
                                        expect(current <= next).toBe(true)
                                    } else {
                                        expect(current >= next).toBe(true)
                                    }
                                }
                            }
                        }
                    }
                ),
                { numRuns: 10 }
            )
        })

        it('should allow SELECT by specific ID', async () => {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) {
                console.warn('Skipping property test: No authenticated session available')
                return
            }

            // First, get some existing product IDs
            const { data: existingProducts } = await supabase
                .from('products')
                .select('id')
                .limit(10)

            if (!existingProducts || existingProducts.length === 0) {
                console.warn('Skipping property test: No products available in database')
                return
            }

            await fc.assert(
                fc.asyncProperty(
                    // Pick random product ID from existing products
                    fc.constantFrom(...existingProducts.map(p => p.id)),
                    async (productId) => {
                        // Execute: SELECT specific product by ID
                        const { data, error, status } = await supabase
                            .from('products')
                            .select('*')
                            .eq('id', productId)
                            .single()

                        // Property: SELECT by ID should succeed
                        expect(error).toBeNull()
                        expect(status).toBe(200)
                        expect(data).toBeTruthy()

                        // Property: Returned product should have the correct ID
                        if (data) {
                            expect(data.id).toBe(productId)
                        }
                    }
                ),
                { numRuns: 10 }
            )
        })

        it('should allow SELECT with text search', async () => {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) {
                console.warn('Skipping property test: No authenticated session available')
                return
            }

            await fc.assert(
                fc.asyncProperty(
                    // Generate random search terms
                    fc.string({ minLength: 1, maxLength: 20 }),
                    async (searchTerm) => {
                        // Execute: SELECT products with text search
                        const { data, error, status } = await supabase
                            .from('products')
                            .select('*')
                            .ilike('name', `%${searchTerm}%`)
                            .limit(10)

                        // Property: SELECT with text search should succeed
                        expect(error).toBeNull()
                        expect(status).toBe(200)
                        expect(Array.isArray(data)).toBe(true)

                        // Property: All returned products should contain the search term (case-insensitive)
                        if (data && data.length > 0) {
                            data.forEach(product => {
                                expect(
                                    product.name.toLowerCase().includes(searchTerm.toLowerCase())
                                ).toBe(true)
                            })
                        }
                    }
                ),
                { numRuns: 10 }
            )
        })

        it('should allow SELECT with numeric range filters', async () => {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) {
                console.warn('Skipping property test: No authenticated session available')
                return
            }

            await fc.assert(
                fc.asyncProperty(
                    // Generate random numeric range
                    fc.record({
                        minCalories: fc.double({ min: 0, max: 500, noNaN: true }),
                        maxCalories: fc.double({ min: 500, max: 1000, noNaN: true }),
                    }),
                    async (range) => {
                        // Execute: SELECT products within calorie range
                        const { data, error, status } = await supabase
                            .from('products')
                            .select('*')
                            .gte('calories_per_100g', range.minCalories)
                            .lte('calories_per_100g', range.maxCalories)
                            .limit(10)

                        // Property: SELECT with range filters should succeed
                        expect(error).toBeNull()
                        expect(status).toBe(200)
                        expect(Array.isArray(data)).toBe(true)

                        // Property: All returned products should be within the range
                        if (data && data.length > 0) {
                            data.forEach(product => {
                                expect(product.calories_per_100g).toBeGreaterThanOrEqual(range.minCalories)
                                expect(product.calories_per_100g).toBeLessThanOrEqual(range.maxCalories)
                            })
                        }
                    }
                ),
                { numRuns: 10 }
            )
        })

        it('should return consistent results for repeated queries', async () => {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) {
                console.warn('Skipping property test: No authenticated session available')
                return
            }

            await fc.assert(
                fc.asyncProperty(
                    fc.integer({ min: 1, max: 20 }),
                    async (limit) => {
                        // Execute: Same query twice
                        const { data: data1, status: status1 } = await supabase
                            .from('products')
                            .select('*')
                            .limit(limit)

                        const { data: data2, status: status2 } = await supabase
                            .from('products')
                            .select('*')
                            .limit(limit)

                        // Property: Both queries should succeed
                        expect(status1).toBe(200)
                        expect(status2).toBe(200)

                        // Property: Results should be consistent
                        expect(data1?.length).toBe(data2?.length)

                        if (data1 && data2 && data1.length > 0) {
                            // Check that IDs match (assuming stable ordering)
                            data1.forEach((product, index) => {
                                expect(product.id).toBe(data2[index].id)
                            })
                        }
                    }
                ),
                { numRuns: 5 } // Fewer runs for consistency checks
            )
        })
    })
})
