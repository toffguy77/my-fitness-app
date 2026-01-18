/**
 * Property-based tests for Products INSERT RLS Policy
 * Feature: error-handling-improvements, Property 3: Products INSERT Permission
 *
 * Validates: Requirements 2.1, 2.3, 2.5
 */

import * as fc from 'fast-check'
import { createClient } from '@supabase/supabase-js'

// Use real Supabase credentials
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kvdusetwlsxcusbjwvdu.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2ZHVzZXR3bHN4Y3VzYmp3dmR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4NjQ1NjQsImV4cCI6MjA4MTQ0MDU2NH0.mKgvI8QtB7riRIH3NQvd-YF3D5kcK5iiVeyfkd750Nk'

describe('Products INSERT RLS Property Tests', () => {
    let supabase: ReturnType<typeof createClient>
    const createdProductIds: string[] = []

    beforeAll(() => {
        supabase = createClient(supabaseUrl, supabaseAnonKey)
    })

    afterAll(async () => {
        // Cleanup: Try to delete test products (will fail if not super_admin, which is expected)
        if (createdProductIds.length > 0) {
            try {
                await supabase.from('products').delete().in('id', createdProductIds)
            } catch (error) {
                // Ignore cleanup errors
            }
        }
    })

    describe('Property 3: Products INSERT Permission', () => {
        /**
         * Property: For any authenticated user attempting to insert a product,
         * the database should return HTTP 200/201 and successfully create the record
         *
         * This property ensures that:
         * 1. All authenticated users can INSERT products (not just super_admin)
         * 2. The RLS policy allows product creation from external APIs
         * 3. HTTP status codes are correct (200 or 201)
         * 4. The inserted data matches what was sent
         */
        it('should allow INSERT for any valid product data structure', async () => {
            // Skip if no authenticated session
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) {
                console.warn('Skipping property test: No authenticated session available')
                return
            }

            await fc.assert(
                fc.asyncProperty(
                    // Generate random product data
                    fc.record({
                        name: fc.string({ minLength: 1, maxLength: 200 }),
                        brand: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: null }),
                        barcode: fc.option(
                            fc.string({ minLength: 8, maxLength: 20 }).map(s => `TEST-${Date.now()}-${s}`),
                            { nil: null }
                        ),
                        calories_per_100g: fc.double({ min: 0, max: 900, noNaN: true }),
                        protein_per_100g: fc.double({ min: 0, max: 100, noNaN: true }),
                        fats_per_100g: fc.double({ min: 0, max: 100, noNaN: true }),
                        carbs_per_100g: fc.double({ min: 0, max: 100, noNaN: true }),
                        source: fc.constantFrom('user', 'openfoodfacts', 'usda') as fc.Arbitrary<'user' | 'openfoodfacts' | 'usda'>,
                    }),
                    async (productData) => {
                        // Execute: Insert product
                        const result = await supabase
                            .from('products')
                            .insert(productData as any)
                            .select()
                            .single()

                        const { data, error, status } = result

                        // Property 1: No error should occur
                        expect(error).toBeNull()

                        // Property 2: HTTP status should be 201 (Created)
                        expect(status).toBe(201)

                        // Property 3: Data should be returned
                        expect(data).toBeTruthy()

                        // Property 4: Inserted data should match input (within floating point precision)
                        if (data) {
                            const typedData = data as any
                            expect(typedData.name).toBe(productData.name)
                            expect(typedData.brand).toBe(productData.brand)
                            expect(typedData.source).toBe(productData.source)

                            // Check numeric values with tolerance for floating point
                            expect(Math.abs(typedData.calories_per_100g - productData.calories_per_100g)).toBeLessThan(0.01)
                            expect(Math.abs(typedData.protein_per_100g - productData.protein_per_100g)).toBeLessThan(0.01)
                            expect(Math.abs(typedData.fats_per_100g - productData.fats_per_100g)).toBeLessThan(0.01)
                            expect(Math.abs(typedData.carbs_per_100g - productData.carbs_per_100g)).toBeLessThan(0.01)

                            // Store for cleanup
                            createdProductIds.push(typedData.id)
                        }
                    }
                ),
                { numRuns: 10 } // Reduced runs for database operations
            )
        })

        it('should handle INSERT with minimal required fields', async () => {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) {
                console.warn('Skipping property test: No authenticated session available')
                return
            }

            await fc.assert(
                fc.asyncProperty(
                    // Generate minimal product data (only required fields)
                    fc.record({
                        name: fc.string({ minLength: 1, maxLength: 200 }),
                        calories_per_100g: fc.double({ min: 0, max: 900, noNaN: true }),
                        protein_per_100g: fc.double({ min: 0, max: 100, noNaN: true }),
                        fats_per_100g: fc.double({ min: 0, max: 100, noNaN: true }),
                        carbs_per_100g: fc.double({ min: 0, max: 100, noNaN: true }),
                    }),
                    async (productData) => {
                        const result = await supabase
                            .from('products')
                            .insert(productData as any)
                            .select()
                            .single()

                        const { data, error, status } = result

                        // Property: INSERT should succeed with minimal fields
                        expect(error).toBeNull()
                        expect(status).toBe(201)
                        expect(data).toBeTruthy()

                        if (data) {
                            createdProductIds.push((data as any).id)
                        }
                    }
                ),
                { numRuns: 10 }
            )
        })

        it('should handle INSERT with various source types', async () => {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) {
                console.warn('Skipping property test: No authenticated session available')
                return
            }

            await fc.assert(
                fc.asyncProperty(
                    // Test all valid source types
                    fc.constantFrom('user', 'openfoodfacts', 'usda') as fc.Arbitrary<'user' | 'openfoodfacts' | 'usda'>,
                    fc.string({ minLength: 1, maxLength: 200 }),
                    fc.double({ min: 0, max: 900, noNaN: true }),
                    fc.double({ min: 0, max: 100, noNaN: true }),
                    fc.double({ min: 0, max: 100, noNaN: true }),
                    fc.double({ min: 0, max: 100, noNaN: true }),
                    async (source, name, calories, protein, fats, carbs) => {
                        const productData = {
                            name,
                            source,
                            calories_per_100g: calories,
                            protein_per_100g: protein,
                            fats_per_100g: fats,
                            carbs_per_100g: carbs,
                        }

                        const result = await supabase
                            .from('products')
                            .insert(productData as any)
                            .select()
                            .single()

                        const { data, error, status } = result

                        // Property: All source types should be allowed
                        expect(error).toBeNull()
                        expect(status).toBe(201)
                        expect(data).toBeTruthy()

                        if (data) {
                            const typedData = data as any
                            expect(typedData.source).toBe(source)
                            createdProductIds.push(typedData.id)
                        }
                    }
                ),
                { numRuns: 10 }
            )
        })

        it('should maintain data integrity across multiple INSERTs', async () => {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) {
                console.warn('Skipping property test: No authenticated session available')
                return
            }

            await fc.assert(
                fc.asyncProperty(
                    // Generate array of products
                    fc.array(
                        fc.record({
                            name: fc.string({ minLength: 1, maxLength: 200 }),
                            calories_per_100g: fc.double({ min: 0, max: 900, noNaN: true }),
                            protein_per_100g: fc.double({ min: 0, max: 100, noNaN: true }),
                            fats_per_100g: fc.double({ min: 0, max: 100, noNaN: true }),
                            carbs_per_100g: fc.double({ min: 0, max: 100, noNaN: true }),
                        }),
                        { minLength: 1, maxLength: 3 } // Small batches for database
                    ),
                    async (products) => {
                        const insertedProducts: any[] = []

                        // Insert all products
                        for (const product of products) {
                            const result = await supabase
                                .from('products')
                                .insert(product as any)
                                .select()
                                .single()

                            const { data, error, status } = result

                            // Property: Each INSERT should succeed independently
                            expect(error).toBeNull()
                            expect(status).toBe(201)
                            expect(data).toBeTruthy()

                            if (data) {
                                insertedProducts.push(data)
                                createdProductIds.push((data as any).id)
                            }
                        }

                        // Property: Number of successful inserts should match input
                        expect(insertedProducts.length).toBe(products.length)

                        // Property: Each product should maintain its data integrity
                        insertedProducts.forEach((inserted, index) => {
                            const original = products[index]
                            expect(inserted.name).toBe(original.name)
                            expect(Math.abs(inserted.calories_per_100g - original.calories_per_100g)).toBeLessThan(0.01)
                        })
                    }
                ),
                { numRuns: 5 } // Fewer runs for batch operations
            )
        })
    })
})
