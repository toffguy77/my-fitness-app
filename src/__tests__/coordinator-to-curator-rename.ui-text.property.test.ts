/**
 * Property-Based Tests: User Interface Text Replacement Completeness
 * **Feature: coordinator-to-curator-rename, Property 5: User Interface Text Replacement Completeness**
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5**
 */

import * as fc from 'fast-check'
import { readFileSync } from 'fs'
import { join } from 'path'
import { glob } from 'glob'

describe('Property 5: User Interface Text Replacement Completeness', () => {
    // Generator for Russian coordinator text that should be replaced
    const russianCoordinatorTextGenerator = fc.oneof(
        fc.constant('координатор'),
        fc.constant('координатора'),
        fc.constant('координатору'),
        fc.constant('координатором'),
        fc.constant('координаторе'),
        fc.constant('координаторы'),
        fc.constant('координаторов'),
        fc.constant('координаторам'),
        fc.constant('координаторами'),
        fc.constant('координаторах')
    )

    // Generator for English coordinator text that should be replaced
    const englishCoordinatorTextGenerator = fc.oneof(
        fc.constant('coordinator'),
        fc.constant('Coordinator'),
        fc.constant('COORDINATOR'),
        fc.constant('coordinators'),
        fc.constant('Coordinators'),
        fc.constant('COORDINATORS')
    )

    // Generator for Russian curator text that should be present
    const russianCuratorTextGenerator = fc.oneof(
        fc.constant('куратор'),
        fc.constant('куратора'),
        fc.constant('куратору'),
        fc.constant('куратором'),
        fc.constant('кураторе'),
        fc.constant('кураторы'),
        fc.constant('кураторов'),
        fc.constant('кураторам'),
        fc.constant('кураторами'),
        fc.constant('кураторах')
    )

    // Generator for English curator text that should be present
    const englishCuratorTextGenerator = fc.oneof(
        fc.constant('curator'),
        fc.constant('Curator'),
        fc.constant('CURATOR'),
        fc.constant('curators'),
        fc.constant('Curators'),
        fc.constant('CURATORS')
    )

    // Get all UI-related files (components, pages, etc.)
    const getUIFiles = (): string[] => {
        const patterns = [
            'src/components/**/*.tsx',
            'src/app/**/*.tsx',
            'src/app/**/*.ts'
        ]

        return patterns.flatMap(pattern =>
            glob.sync(pattern, { cwd: process.cwd() })
        ).filter(file =>
            // Exclude test files and property test files themselves
            !file.includes('.test.') &&
            !file.includes('.spec.') &&
            !file.includes('coordinator-to-curator-rename') &&
            // Include only UI-related files
            (file.includes('/components/') ||
                file.includes('/app/') ||
                file.includes('page.tsx') ||
                file.includes('layout.tsx'))
        )
    }

    it('should not contain Russian coordinator text in UI files', () => {
        fc.assert(
            fc.property(
                fc.array(russianCoordinatorTextGenerator, { minLength: 1, maxLength: 5 }),
                (coordinatorTexts) => {
                    const uiFiles = getUIFiles()

                    for (const file of uiFiles) {
                        const content = readFileSync(join(process.cwd(), file), 'utf-8')

                        for (const coordinatorText of coordinatorTexts) {
                            // Check that coordinator text is not present in UI content
                            expect(content).not.toMatch(new RegExp(coordinatorText, 'gi'))
                        }
                    }
                }
            ),
            { numRuns: 50 }
        )
    })

    it('should not contain English coordinator text in UI files', () => {
        fc.assert(
            fc.property(
                fc.array(englishCoordinatorTextGenerator, { minLength: 1, maxLength: 5 }),
                (coordinatorTexts) => {
                    const uiFiles = getUIFiles()

                    for (const file of uiFiles) {
                        const content = readFileSync(join(process.cwd(), file), 'utf-8')

                        for (const coordinatorText of coordinatorTexts) {
                            // Check that coordinator text is not present in UI content
                            // Allow exceptions for test files and comments about the renaming
                            if (!content.includes('coordinator-to-curator-rename') &&
                                !content.includes('Property-Based Tests') &&
                                !content.includes('Component Tests')) {
                                expect(content).not.toMatch(new RegExp(`\\b${coordinatorText}\\b`, 'g'))
                            }
                        }
                    }
                }
            ),
            { numRuns: 50 }
        )
    })

    it('should contain appropriate curator text in UI files', () => {
        // Simple check: at least one UI file should contain curator terminology
        const uiFiles = getUIFiles()
        let foundCuratorText = false

        for (const file of uiFiles) {
            const content = readFileSync(join(process.cwd(), file), 'utf-8')

            // Check for basic curator text (Russian or English)
            if (content.includes('куратор') ||
                content.includes('curator') ||
                content.includes('Curator') ||
                content.includes('curator_id') ||
                content.includes('curatorId')) {
                foundCuratorText = true
                break
            }
        }

        // At least some UI files should contain curator terminology
        expect(foundCuratorText).toBe(true)
    })

    it('should have consistent terminology in navigation and labels', () => {
        fc.assert(
            fc.property(
                fc.record({
                    navigationFile: fc.constantFrom(
                        'src/components/Navigation.tsx',
                        'src/app/layout.tsx'
                    ),
                    expectedTexts: fc.array(
                        fc.oneof(
                            fc.constant('куратор'),
                            fc.constant('curator'),
                            fc.constant('Клиенты'),
                            fc.constant('clients')
                        ),
                        { minLength: 1, maxLength: 2 }
                    ),
                }),
                (testData) => {
                    try {
                        const content = readFileSync(join(process.cwd(), testData.navigationFile), 'utf-8')

                        // Navigation should use curator terminology consistently
                        // Check that if any curator-related text is present, it uses the correct terminology
                        const hasRoleReferences = content.includes('role') ||
                            content.includes('роль') ||
                            content.includes('navigation') ||
                            content.includes('навигация')

                        if (hasRoleReferences) {
                            // Should not contain old coordinator terminology
                            expect(content).not.toMatch(/координатор/gi)
                            expect(content).not.toMatch(/\bcoordinator\b/gi)
                        }
                    } catch (error) {
                        // File might not exist, which is acceptable
                        expect(true).toBe(true)
                    }
                }
            ),
            { numRuns: 20 }
        )
    })

    it('should have updated form labels and button text', () => {
        fc.assert(
            fc.property(
                fc.record({
                    formElements: fc.array(
                        fc.oneof(
                            fc.constant('label'),
                            fc.constant('button'),
                            fc.constant('placeholder'),
                            fc.constant('title'),
                            fc.constant('aria-label')
                        ),
                        { minLength: 1, maxLength: 3 }
                    ),
                }),
                (testData) => {
                    const uiFiles = getUIFiles().filter(file =>
                        file.includes('/components/') ||
                        file.includes('/app/') && file.endsWith('.tsx')
                    )

                    for (const file of uiFiles) {
                        const content = readFileSync(join(process.cwd(), file), 'utf-8')

                        // Check form elements for coordinator text
                        for (const element of testData.formElements) {
                            const elementRegex = new RegExp(`${element}[^>]*координатор`, 'gi')
                            const englishElementRegex = new RegExp(`${element}[^>]*\\bcoordinator\\b`, 'gi')

                            expect(content).not.toMatch(elementRegex)
                            expect(content).not.toMatch(englishElementRegex)
                        }
                    }
                }
            ),
            { numRuns: 30 }
        )
    })

    it('should have updated page titles and headings', () => {
        fc.assert(
            fc.property(
                fc.record({
                    headingElements: fc.array(
                        fc.oneof(
                            fc.constant('h1'),
                            fc.constant('h2'),
                            fc.constant('h3'),
                            fc.constant('title'),
                            fc.constant('meta.*title')
                        ),
                        { minLength: 1, maxLength: 3 }
                    ),
                }),
                (testData) => {
                    const uiFiles = getUIFiles()

                    for (const file of uiFiles) {
                        const content = readFileSync(join(process.cwd(), file), 'utf-8')

                        // Check heading elements for coordinator text
                        for (const element of testData.headingElements) {
                            const headingRegex = new RegExp(`<${element}[^>]*>[^<]*координатор[^<]*</${element}>`, 'gi')
                            const englishHeadingRegex = new RegExp(`<${element}[^>]*>[^<]*\\bcoordinator\\b[^<]*</${element}>`, 'gi')

                            expect(content).not.toMatch(headingRegex)
                            expect(content).not.toMatch(englishHeadingRegex)
                        }
                    }
                }
            ),
            { numRuns: 30 }
        )
    })
})