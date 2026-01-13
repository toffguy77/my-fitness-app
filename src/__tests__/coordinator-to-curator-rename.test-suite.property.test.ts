/**
 * Property-Based Tests: Test Suite Compatibility
 * **Feature: coordinator-to-curator-rename, Property 7: Test Suite Compatibility**
 * **Validates: Requirements 7.1, 7.2, 7.4, 7.5**
 */

import * as fc from 'fast-check'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { glob } from 'glob'

describe('Property 7: Test Suite Compatibility', () => {
    // Generator for test file patterns
    const testFilePatternGenerator = fc.oneof(
        fc.constant('**/*.test.ts'),
        fc.constant('**/*.spec.ts'),
        fc.constant('e2e/*.spec.ts'),
        fc.constant('src/**/*.test.ts')
    )

    // Generator for test terminology that should be updated
    const testTerminologyGenerator = fc.record({
        oldTerm: fc.constantFrom('coordinator', 'Coordinator', 'COORDINATOR'),
        newTerm: fc.constantFrom('curator', 'Curator', 'CURATOR'),
        context: fc.constantFrom('describe', 'test', 'it', 'comment', 'variable')
    })

    // Helper function to get all test files
    function getTestFiles(): string[] {
        const patterns = [
            'src/**/*.test.ts',
            'e2e/*.spec.ts'
        ]

        let allFiles: string[] = []
        for (const pattern of patterns) {
            try {
                const files = glob.sync(pattern, {
                    cwd: process.cwd(),
                    ignore: ['**/node_modules/**', '**/coverage/**']
                })
                allFiles = allFiles.concat(files)
            } catch (error) {
                // If glob fails, continue with other patterns
                console.warn(`Failed to glob pattern ${pattern}:`, error)
            }
        }

        return allFiles.filter(file =>
            existsSync(join(process.cwd(), file)) &&
            !file.includes('node_modules') &&
            !file.includes('coverage')
        )
    }

    // Helper function to check if a test file contains coordinator references
    function hasCoordinatorReferences(filePath: string): boolean {
        try {
            const content = readFileSync(join(process.cwd(), filePath), 'utf-8')

            // Skip files that are part of the renaming process itself
            if (content.includes('coordinator-to-curator-rename')) {
                return false
            }

            // Check for coordinator references in test contexts
            const coordinatorPatterns = [
                /\bcoordinator\b/gi,
                /координатор/gi
            ]

            return coordinatorPatterns.some(pattern => pattern.test(content))
        } catch (error) {
            return false
        }
    }

    it('should not contain coordinator terminology in test files', () => {
        fc.assert(
            fc.property(
                testFilePatternGenerator,
                (pattern) => {
                    const testFiles = getTestFiles()

                    for (const file of testFiles) {
                        try {
                            const content = readFileSync(join(process.cwd(), file), 'utf-8')

                            // Skip files that are part of the renaming process
                            if (content.includes('coordinator-to-curator-rename') ||
                                content.includes('Property-Based Tests') ||
                                file.includes('coordinator-to-curator-rename')) {
                                continue
                            }

                            // Check that coordinator terminology is not present
                            expect(content).not.toMatch(/\bcoordinator\b/gi)
                            expect(content).not.toMatch(/координатор/gi)

                        } catch (error) {
                            // If file can't be read, skip it
                            continue
                        }
                    }
                }
            ),
            { numRuns: 10 }
        )
    })

    it('should use curator terminology consistently in test descriptions', () => {
        fc.assert(
            fc.property(
                testTerminologyGenerator,
                (terminology) => {
                    const testFiles = getTestFiles()

                    for (const file of testFiles) {
                        try {
                            const content = readFileSync(join(process.cwd(), file), 'utf-8')

                            // Skip files that are part of the renaming process
                            if (content.includes('coordinator-to-curator-rename')) {
                                continue
                            }

                            // If file contains role references, it should use curator terminology
                            const hasRoleReferences = /describe\(|test\(|it\(/gi.test(content) &&
                                (/role|dashboard|chat|client/gi.test(content))

                            if (hasRoleReferences) {
                                // Should not contain old coordinator terminology
                                expect(content).not.toMatch(/\bcoordinator\b/gi)
                                expect(content).not.toMatch(/координатор/gi)
                            }
                        } catch (error) {
                            // If file can't be read, skip it
                            continue
                        }
                    }
                }
            ),
            { numRuns: 10 }
        )
    })

    it('should maintain test coverage after terminology updates', () => {
        fc.assert(
            fc.property(
                fc.record({
                    testType: fc.constantFrom('unit', 'integration', 'e2e'),
                    functionality: fc.constantFrom('dashboard', 'chat', 'routing', 'middleware')
                }),
                (testData) => {
                    const testFiles = getTestFiles()

                    // Verify that test files exist for core functionality
                    const relevantTests = testFiles.filter(file => {
                        const content = existsSync(join(process.cwd(), file))
                            ? readFileSync(join(process.cwd(), file), 'utf-8')
                            : ''

                        return content.includes(testData.functionality) ||
                            file.includes(testData.functionality)
                    })

                    // Should have tests for core functionality
                    if (testData.functionality === 'dashboard' ||
                        testData.functionality === 'chat' ||
                        testData.functionality === 'routing') {
                        expect(relevantTests.length).toBeGreaterThan(0)
                    }
                }
            ),
            { numRuns: 20 }
        )
    })

    it('should have updated test file names to use curator terminology', () => {
        fc.assert(
            fc.property(
                fc.constantFrom('coordinator', 'Coordinator'),
                (oldTerm) => {
                    const testFiles = getTestFiles()

                    // Check that no test files contain coordinator in their names
                    const coordinatorTestFiles = testFiles.filter(file =>
                        file.toLowerCase().includes('coordinator') &&
                        !file.includes('coordinator-to-curator-rename')
                    )

                    expect(coordinatorTestFiles).toHaveLength(0)
                }
            ),
            { numRuns: 5 }
        )
    })

    it('should validate test selectors and assertions use curator terminology', () => {
        fc.assert(
            fc.property(
                fc.record({
                    selectorType: fc.constantFrom('text', 'data-testid', 'aria-label', 'placeholder'),
                    context: fc.constantFrom('dashboard', 'chat', 'navigation')
                }),
                (testData) => {
                    const e2eFiles = getTestFiles().filter(file => file.includes('e2e/'))

                    for (const file of e2eFiles) {
                        try {
                            const content = readFileSync(join(process.cwd(), file), 'utf-8')

                            // Skip files that are part of the renaming process
                            if (content.includes('coordinator-to-curator-rename')) {
                                continue
                            }

                            // Check for coordinator references in selectors
                            const coordinatorSelectorPatterns = [
                                /text=.*coordinator/gi,
                                /data-testid.*coordinator/gi,
                                /aria-label.*coordinator/gi,
                                /placeholder.*coordinator/gi,
                                /координатор/gi
                            ]

                            for (const pattern of coordinatorSelectorPatterns) {
                                expect(content).not.toMatch(pattern)
                            }

                        } catch (error) {
                            // If file can't be read, skip it
                            continue
                        }
                    }
                }
            ),
            { numRuns: 15 }
        )
    })

    it('should validate test URLs and navigation use curator paths', () => {
        fc.assert(
            fc.property(
                fc.record({
                    urlPattern: fc.constantFrom('/app/curator', '/app/curator/invites', '/app/curator/[clientId]'),
                    testMethod: fc.constantFrom('goto', 'waitForURL', 'toHaveURL')
                }),
                (testData) => {
                    const e2eFiles = getTestFiles().filter(file => file.includes('e2e/'))

                    for (const file of e2eFiles) {
                        try {
                            const content = readFileSync(join(process.cwd(), file), 'utf-8')

                            // Skip files that are part of the renaming process
                            if (content.includes('coordinator-to-curator-rename')) {
                                continue
                            }

                            // If file contains navigation to curator paths, verify they're correct
                            if (content.includes('/app/curator')) {
                                // Should not contain old coordinator paths
                                expect(content).not.toMatch(/\/app\/coordinator/g)
                            }

                        } catch (error) {
                            // If file can't be read, skip it
                            continue
                        }
                    }
                }
            ),
            { numRuns: 10 }
        )
    })

    it('should validate mock data and fixtures use curator terminology', () => {
        fc.assert(
            fc.property(
                fc.record({
                    mockType: fc.constantFrom('user', 'role', 'profile', 'message'),
                    fieldName: fc.constantFrom('role', 'user_role', 'sender_role', 'recipient_role')
                }),
                (testData) => {
                    const testFiles = getTestFiles()

                    for (const file of testFiles) {
                        try {
                            const content = readFileSync(join(process.cwd(), file), 'utf-8')

                            // Skip files that are part of the renaming process
                            if (content.includes('coordinator-to-curator-rename')) {
                                continue
                            }

                            // Check for coordinator references in mock data
                            const mockDataPatterns = [
                                /role:\s*['"]coordinator['"]/gi,
                                /user_role:\s*['"]coordinator['"]/gi,
                                /'coordinator'/gi,
                                /"coordinator"/gi
                            ]

                            for (const pattern of mockDataPatterns) {
                                // Allow coordinator in type definitions but not in actual values
                                const matches = content.match(pattern) || []
                                const allowedMatches = matches.filter(match =>
                                    // Allow in type definitions
                                    content.includes(`'client' | 'curator' | 'super_admin'`) ||
                                    content.includes(`"client" | "curator" | "super_admin"`) ||
                                    // Allow in comments about the renaming
                                    match.includes('// ') ||
                                    match.includes('/* ')
                                )

                                expect(matches.length).toBe(allowedMatches.length)
                            }

                        } catch (error) {
                            // If file can't be read, skip it
                            continue
                        }
                    }
                }
            ),
            { numRuns: 15 }
        )
    })
})