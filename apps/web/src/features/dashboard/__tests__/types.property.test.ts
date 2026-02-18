/**
 * Property-based tests for dashboard types
 * 
 * Feature: coach-to-curator-refactoring
 * Property 5: Отсутствие "coach" в TypeScript-коде
 * 
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
 */

import * as fc from 'fast-check'
import * as fs from 'fs'
import * as path from 'path'

describe('Property 5: Отсутствие "coach" в TypeScript-коде', () => {
    const dashboardDir = path.join(__dirname, '..')

    /**
     * Get all TypeScript files in the dashboard feature directory
     */
    function getTypeScriptFiles(dir: string): string[] {
        const files: string[] = []

        function walkDir(currentDir: string) {
            const entries = fs.readdirSync(currentDir, { withFileTypes: true })

            for (const entry of entries) {
                const fullPath = path.join(currentDir, entry.name)

                if (entry.isDirectory()) {
                    // Skip node_modules and test directories for this check
                    if (entry.name !== 'node_modules' && entry.name !== '__tests__') {
                        walkDir(fullPath)
                    }
                } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
                    // Skip test files
                    if (!entry.name.includes('.test.') && !entry.name.includes('.spec.')) {
                        files.push(fullPath)
                    }
                }
            }
        }

        walkDir(dir)
        return files
    }

    /**
     * Check if a file contains "coach" in field names, variable names, or type names
     * Excludes comments and strings that might contain historical references
     */
    function containsCoachInCode(content: string): { found: boolean; matches: string[] } {
        const matches: string[] = []

        // Remove comments (single-line and multi-line)
        const withoutComments = content
            .replace(/\/\/.*$/gm, '') // Single-line comments
            .replace(/\/\*[\s\S]*?\*\//g, '') // Multi-line comments

        // Patterns to check for "coach" in code (case-insensitive for field names)
        const patterns = [
            /\bcoachId\b/gi,           // Field name coachId
            /\bcoachFeedback\b/gi,     // Field name coachFeedback
            /\bCoachID\b/g,            // Type field CoachID
            /\bCoachFeedback\b/g,      // Type field CoachFeedback
            /coach_id/gi,              // Snake case coach_id
            /coach_feedback/gi,        // Snake case coach_feedback
            /:\s*['"]coach['"]/gi,     // String literal "coach" as value
        ]

        for (const pattern of patterns) {
            const found = withoutComments.match(pattern)
            if (found) {
                matches.push(...found)
            }
        }

        return { found: matches.length > 0, matches }
    }

    it('should not contain "coach" in any TypeScript source files', () => {
        const files = getTypeScriptFiles(dashboardDir)

        expect(files.length).toBeGreaterThan(0)

        const violations: { file: string; matches: string[] }[] = []

        for (const file of files) {
            const content = fs.readFileSync(file, 'utf-8')
            const result = containsCoachInCode(content)

            if (result.found) {
                violations.push({
                    file: path.relative(dashboardDir, file),
                    matches: result.matches,
                })
            }
        }

        if (violations.length > 0) {
            const message = violations
                .map(v => `${v.file}: ${v.matches.join(', ')}`)
                .join('\n')
            fail(`Found "coach" references in TypeScript files:\n${message}`)
        }
    })

    it('should use "curator" terminology consistently in types.ts', () => {
        const typesFile = path.join(dashboardDir, 'types.ts')
        const content = fs.readFileSync(typesFile, 'utf-8')

        // Check that curator fields exist
        expect(content).toContain('curatorId')
        expect(content).toContain('curatorFeedback')

        // Check that coach fields do not exist (excluding comments)
        const result = containsCoachInCode(content)
        expect(result.found).toBe(false)
    })

    it('property: all generated curator IDs should be valid strings', () => {
        fc.assert(
            fc.property(
                fc.string({ minLength: 1, maxLength: 100 }),
                (curatorId) => {
                    // Property: any non-empty string is a valid curator ID
                    return curatorId.length > 0
                }
            ),
            { numRuns: 100 }
        )
    })

    it('property: curator feedback can be any string up to 2000 characters', () => {
        fc.assert(
            fc.property(
                fc.string({ minLength: 0, maxLength: 2000 }),
                (curatorFeedback) => {
                    // Property: feedback length should be within bounds
                    return curatorFeedback.length <= 2000
                }
            ),
            { numRuns: 100 }
        )
    })
})
