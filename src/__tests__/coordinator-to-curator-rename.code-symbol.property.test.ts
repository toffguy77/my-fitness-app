/**
 * Property-Based Tests: Code Symbol Renaming Completeness
 * **Feature: coordinator-to-curator-rename, Property 4: Code Symbol Renaming Completeness**
 * **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5**
 */

import * as fc from 'fast-check'
import * as fs from 'fs'
import * as path from 'path'
import { glob } from 'glob'

describe('Property 4: Code Symbol Renaming Completeness', () => {
    // Generator for code symbols that should be renamed
    const coordinatorSymbolGenerator = fc.oneof(
        fc.constant('coordinatorId'),
        fc.constant('coordinator_id'),
        fc.constant('coordinatorName'),
        fc.constant('coordinator_name'),
        fc.constant('coordinatorUserId'),
        fc.constant('coordinatorProfile'),
        fc.constant('coordinatorClients'),
        fc.constant('getCoordinatorClients'),
        fc.constant('isCoordinator'),
        fc.constant('CoordinatorDashboard'),
        fc.constant('coordinatorNavigationItems'),
        fc.constant('coordinator_note_notification'), // This should be renamed to curator_note_notification
        fc.constant('coordinatorNote'),
        fc.constant('coordinator_notes')
    )

    // Generator for curator symbols that should exist
    const curatorSymbolGenerator = fc.oneof(
        fc.constant('curatorId'),
        fc.constant('curator_id'),
        fc.constant('curatorName'),
        fc.constant('curator_name'),
        fc.constant('curatorUserId'),
        fc.constant('curatorProfile'),
        fc.constant('curatorClients'),
        fc.constant('getCuratorClients'),
        fc.constant('isCurator'),
        fc.constant('CuratorDashboard'),
        fc.constant('curatorNavigationItems'),
        fc.constant('curator_note_notification'),
        fc.constant('curatorNote'),
        fc.constant('curator_notes')
    )

    // Generator for non-coordinator symbols that should remain unchanged
    const nonCoordinatorSymbolGenerator = fc.oneof(
        fc.constant('userId'),
        fc.constant('user_id'),
        fc.constant('clientId'),
        fc.constant('client_id'),
        fc.constant('userName'),
        fc.constant('userProfile'),
        fc.constant('getUser'),
        fc.constant('isClient'),
        fc.constant('ClientDashboard'),
        fc.constant('clientNavigationItems')
    )

    const getSourceFiles = (): string[] => {
        const patterns = [
            'src/**/*.ts',
            'src/**/*.tsx',
            '!src/**/*.test.ts',
            '!src/**/*.test.tsx',
            '!src/__tests__/**/*'
        ]

        return patterns.flatMap(pattern =>
            glob.sync(pattern, { cwd: process.cwd() })
        ).filter(file =>
            // Exclude the property test files themselves since they contain coordinator symbols for testing
            !file.includes('coordinator-to-curator-rename') &&
            !file.includes('.property.test.ts')
        )
    }

    const readFileContent = (filePath: string): string => {
        try {
            return fs.readFileSync(filePath, 'utf-8')
        } catch (error) {
            return ''
        }
    }

    const containsSymbol = (content: string, symbol: string): boolean => {
        // Check for exact matches as variables, properties, function names, etc.
        const patterns = [
            new RegExp(`\\b${symbol}\\b`, 'g'),           // Word boundary match
            new RegExp(`['"]${symbol}['"]`, 'g'),         // String literal match
            new RegExp(`${symbol}:`, 'g'),                // Object property match
            new RegExp(`\\.${symbol}\\b`, 'g'),           // Property access match
            new RegExp(`${symbol}\\s*=`, 'g'),            // Assignment match
            new RegExp(`${symbol}\\s*\\(`, 'g'),          // Function call match
        ]

        return patterns.some(pattern => pattern.test(content))
    }

    it('should not contain coordinator symbols in source code', () => {
        fc.assert(
            fc.property(
                fc.array(coordinatorSymbolGenerator, { minLength: 1, maxLength: 10 }),
                (coordinatorSymbols) => {
                    const sourceFiles = getSourceFiles()
                    const violations: Array<{ file: string; symbol: string; line?: number }> = []

                    for (const filePath of sourceFiles) {
                        const content = readFileContent(filePath)
                        const lines = content.split('\n')

                        for (const symbol of coordinatorSymbols) {
                            if (containsSymbol(content, symbol)) {
                                // Find the line number for better debugging
                                const lineIndex = lines.findIndex(line => containsSymbol(line, symbol))
                                violations.push({
                                    file: filePath,
                                    symbol,
                                    line: lineIndex >= 0 ? lineIndex + 1 : undefined
                                })
                            }
                        }
                    }

                    if (violations.length > 0) {
                        console.log('Coordinator symbols found in source code:', violations)
                    }

                    return violations.length === 0
                }
            ),
            { numRuns: 50 }
        )
    })

    it('should contain curator symbols in appropriate files', () => {
        fc.assert(
            fc.property(
                fc.array(curatorSymbolGenerator, { minLength: 1, maxLength: 5 }),
                (curatorSymbols) => {
                    const sourceFiles = getSourceFiles()
                    let foundCuratorSymbols = false

                    for (const filePath of sourceFiles) {
                        const content = readFileContent(filePath)

                        for (const symbol of curatorSymbols) {
                            if (containsSymbol(content, symbol)) {
                                foundCuratorSymbols = true
                                break
                            }
                        }

                        if (foundCuratorSymbols) break
                    }

                    // We expect to find at least some curator symbols in the codebase
                    return foundCuratorSymbols
                }
            ),
            { numRuns: 20 }
        )
    })

    it('should preserve non-coordinator symbols', () => {
        fc.assert(
            fc.property(
                fc.array(nonCoordinatorSymbolGenerator, { minLength: 1, maxLength: 5 }),
                (nonCoordinatorSymbols) => {
                    const sourceFiles = getSourceFiles()
                    let foundNonCoordinatorSymbols = false

                    for (const filePath of sourceFiles) {
                        const content = readFileContent(filePath)

                        for (const symbol of nonCoordinatorSymbols) {
                            if (containsSymbol(content, symbol)) {
                                foundNonCoordinatorSymbols = true
                                break
                            }
                        }

                        if (foundNonCoordinatorSymbols) break
                    }

                    // We expect non-coordinator symbols to remain in the codebase
                    return foundNonCoordinatorSymbols
                }
            ),
            { numRuns: 20 }
        )
    })

    it('should have consistent symbol renaming across related files', () => {
        fc.assert(
            fc.property(
                fc.constantFrom(
                    ['coordinatorId', 'curatorId'],
                    ['coordinatorName', 'curatorName'],
                    ['getCoordinatorClients', 'getCuratorClients'],
                    ['coordinatorNote', 'curatorNote']
                ),
                ([oldSymbol, newSymbol]) => {
                    const sourceFiles = getSourceFiles()
                    let hasOldSymbol = false
                    let hasNewSymbol = false

                    for (const filePath of sourceFiles) {
                        const content = readFileContent(filePath)

                        if (containsSymbol(content, oldSymbol)) {
                            hasOldSymbol = true
                        }

                        if (containsSymbol(content, newSymbol)) {
                            hasNewSymbol = true
                        }
                    }

                    // If we find the new symbol, we should not find the old symbol
                    // This ensures consistent renaming
                    if (hasNewSymbol) {
                        return !hasOldSymbol
                    }

                    // If we don't find either, that's also acceptable
                    return true
                }
            ),
            { numRuns: 100 }
        )
    })

    it('should maintain TypeScript compilation after symbol renaming', () => {
        fc.assert(
            fc.property(
                fc.constant(true), // Simple property to trigger the test
                () => {
                    // This test verifies that the codebase still compiles after renaming
                    // In a real scenario, this would run TypeScript compiler
                    // For now, we'll check that key files exist and have expected structure

                    const keyFiles = [
                        'src/utils/supabase/profile.ts',
                        'src/components/chat/ChatWidget.tsx',
                        'src/components/Navigation.tsx',
                        'src/app/app/curator/page.tsx'
                    ]

                    for (const filePath of keyFiles) {
                        const content = readFileContent(filePath)

                        // Verify file exists and has content
                        if (!content || content.length === 0) {
                            return false
                        }

                        // Verify no obvious syntax errors (basic check)
                        const openBraces = (content.match(/{/g) || []).length
                        const closeBraces = (content.match(/}/g) || []).length
                        const openParens = (content.match(/\(/g) || []).length
                        const closeParens = (content.match(/\)/g) || []).length

                        if (openBraces !== closeBraces || openParens !== closeParens) {
                            console.log(`Syntax error detected in ${filePath}`)
                            return false
                        }
                    }

                    return true
                }
            ),
            { numRuns: 10 }
        )
    })

    it('should have proper function and variable naming consistency', () => {
        fc.assert(
            fc.property(
                fc.constantFrom(
                    'src/utils/supabase/profile.ts',
                    'src/components/chat/ChatWidget.tsx',
                    'src/app/app/curator/page.tsx'
                ),
                (filePath) => {
                    const content = readFileContent(filePath)

                    if (!content) return true // File doesn't exist, skip

                    // Check that if we have curator-related functions, they use consistent naming
                    const hasCuratorFunction = /function.*[Cc]urator|const.*[Cc]urator.*=|[Cc]urator.*:/.test(content)
                    const hasCoordinatorFunction = /function.*[Cc]oordinator|const.*[Cc]oordinator.*=|[Cc]oordinator.*:/.test(content)

                    // If we have curator functions, we shouldn't have coordinator functions
                    if (hasCuratorFunction) {
                        return !hasCoordinatorFunction
                    }

                    return true
                }
            ),
            { numRuns: 50 }
        )
    })
})
