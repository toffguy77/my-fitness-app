/**
 * Property-based test for documentation consistency during coordinator-to-curator rename
 * 
 * **Feature: coordinator-to-curator-rename, Property 6: Documentation Text Consistency**
 * **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**
 * 
 * This test ensures that all documentation files have been updated to use "curator" 
 * terminology instead of "coordinator" terminology.
 */

import { describe, test, expect } from '@jest/globals'
import * as fs from 'fs'
import * as path from 'path'
import { glob } from 'glob'

describe('Documentation Consistency Property Tests', () => {
    /**
     * Property 6: Documentation Text Consistency
     * For any documentation file in the project, all references to coordinator 
     * terminology should be updated to curator terminology while maintaining 
     * document structure and meaning
     */
    test('Property 6: All documentation files should use curator terminology instead of coordinator', async () => {
        // Get all markdown files in docs directory and README files
        const docFiles = await glob('docs/**/*.md', { cwd: process.cwd() })
        const readmeFiles = await glob('**/README.md', {
            cwd: process.cwd(),
            ignore: ['node_modules/**', '.next/**', 'coverage/**']
        })

        const allDocFiles = [...docFiles, ...readmeFiles, 'README.md']

        expect(allDocFiles.length).toBeGreaterThan(0)

        const violations: Array<{ file: string, line: number, content: string, type: 'coordinator' | 'координатор' }> = []

        for (const file of allDocFiles) {
            const filePath = path.resolve(process.cwd(), file)

            if (!fs.existsSync(filePath)) {
                continue
            }

            const content = fs.readFileSync(filePath, 'utf-8')
            const lines = content.split('\n')

            lines.forEach((line, index) => {
                // Check for English "coordinator" (case insensitive)
                const coordinatorMatch = line.match(/\bcoordinator\b/i)
                if (coordinatorMatch) {
                    // Skip if it's in a code block or migration file reference
                    if (!line.includes('```') &&
                        !line.includes('v9.0_coach_to_coordinator') &&
                        !line.includes('v10.0_coordinator_to_curator') &&
                        !line.includes('coordinator-to-curator-rename')) {
                        violations.push({
                            file,
                            line: index + 1,
                            content: line.trim(),
                            type: 'coordinator'
                        })
                    }
                }

                // Check for Russian "координатор"
                const coordinatorRuMatch = line.match(/координатор/i)
                if (coordinatorRuMatch) {
                    // Skip if it's in a code block or migration file reference
                    if (!line.includes('```') &&
                        !line.includes('v9.0_coach_to_coordinator') &&
                        !line.includes('v10.0_coordinator_to_curator')) {
                        violations.push({
                            file,
                            line: index + 1,
                            content: line.trim(),
                            type: 'координатор'
                        })
                    }
                }
            })
        }

        // Report violations if any
        if (violations.length > 0) {
            const violationReport = violations.map(v =>
                `${v.file}:${v.line} - "${v.content}" (contains "${v.type}")`
            ).join('\n')

            throw new Error(
                `Found ${violations.length} coordinator references that should be curator:\n${violationReport}`
            )
        }

        // Verify that curator terminology is present
        let curatorCount = 0
        let curatorRuCount = 0

        for (const file of allDocFiles) {
            const filePath = path.resolve(process.cwd(), file)

            if (!fs.existsSync(filePath)) {
                continue
            }

            const content = fs.readFileSync(filePath, 'utf-8')

            // Count curator references
            const curatorMatches = content.match(/\bcurator\b/gi)
            if (curatorMatches) {
                curatorCount += curatorMatches.length
            }

            // Count Russian curator references
            const curatorRuMatches = content.match(/куратор/gi)
            if (curatorRuMatches) {
                curatorRuCount += curatorRuMatches.length
            }
        }

        // Ensure we have curator terminology in documentation
        expect(curatorCount).toBeGreaterThan(0)
        expect(curatorRuCount).toBeGreaterThan(0)
    })

    /**
     * Additional property: Verify specific documentation sections are updated
     */
    test('Property 6.1: Database schema documentation uses curator terminology', () => {
        const schemaDocPath = path.resolve(process.cwd(), 'docs/Database_Schema.md')

        if (!fs.existsSync(schemaDocPath)) {
            throw new Error('Database schema documentation not found')
        }

        const content = fs.readFileSync(schemaDocPath, 'utf-8')

        // Should contain curator_notes table
        expect(content).toMatch(/curator_notes/)

        // Should contain curator_id column references
        expect(content).toMatch(/curator_id/)

        // Should contain curator role in enum
        expect(content).toMatch(/'curator'/)

        // Should not contain old coordinator references (except in migration context)
        const coordinatorMatches = content.match(/\bcoordinator\b/gi) || []
        const allowedCoordinatorRefs = coordinatorMatches.filter(match => {
            const context = content.substring(
                Math.max(0, content.indexOf(match) - 100),
                content.indexOf(match) + 100
            )
            return context.includes('v9.0_coach_to_coordinator') ||
                context.includes('migration')
        })

        expect(coordinatorMatches.length).toBe(allowedCoordinatorRefs.length)
    })

    /**
     * Property 6.2: API documentation uses curator endpoints
     */
    test('Property 6.2: API documentation references curator endpoints', () => {
        const functionalSpecPath = path.resolve(process.cwd(), 'docs/Functional_Specification.md')

        if (!fs.existsSync(functionalSpecPath)) {
            throw new Error('Functional specification documentation not found')
        }

        const content = fs.readFileSync(functionalSpecPath, 'utf-8')

        // Should contain curator endpoints
        expect(content).toMatch(/\/app\/curator/)

        // Should contain curator role references
        expect(content).toMatch(/куратор/)
        expect(content).toMatch(/Curator/)
    })
})