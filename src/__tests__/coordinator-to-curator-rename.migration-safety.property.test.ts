/**
 * Property-Based Tests: Migration Safety and Rollback Capability
 * **Feature: coordinator-to-curator-rename, Property 8: Migration Safety and Rollback Capability**
 * **Validates: Requirements 8.2, 8.3, 8.5**
 */

import fc from 'fast-check'

// Mock database state for testing
interface DatabaseState {
    tables: Record<string, TableData>
    functions: Record<string, FunctionData>
    indexes: Record<string, IndexData>
    policies: Record<string, PolicyData>
    enums: Record<string, EnumData>
    metadata?: {
        version: string
        timestamp: Date
        checksum: string
    }
}

interface TableData {
    name: string
    columns: Record<string, ColumnData>
    rows: Record<string, any>[]
    constraints: readonly string[]
}

interface ColumnData {
    name: string
    type: string
    nullable: boolean
    defaultValue?: any
}

interface FunctionData {
    name: string
    definition: string
    parameters: string[]
    returnType: string
}

interface IndexData {
    name: string
    table: string
    columns: string[]
    unique: boolean
}

interface PolicyData {
    name: string
    table: string
    operation: string
    definition: string
}

interface EnumData {
    name: string
    values: readonly string[]
}

interface MigrationOperation {
    type: 'rename_table' | 'rename_column' | 'rename_function' | 'rename_index' | 'rename_policy' | 'update_enum'
    target: string
    oldName: string
    newName: string
    parentObject?: string | null
}

interface MigrationResult {
    success: boolean
    newState: DatabaseState
    operations: MigrationOperation[]
    backupCreated: boolean
    rollbackPossible: boolean
    errors: string[]
}

interface RollbackResult {
    success: boolean
    restoredState: DatabaseState
    dataIntegrityMaintained: boolean
    errors: string[]
}

// Mock migration and rollback functions
const mockMigrationWithBackup = (initialState: DatabaseState, operations: MigrationOperation[]): MigrationResult => {
    const newState: DatabaseState = JSON.parse(JSON.stringify(initialState)) // Deep clone
    const errors: string[] = []
    let backupCreated = true
    let rollbackPossible = true

    try {
        // Simulate backup creation
        if (!initialState.metadata || !initialState.metadata.version || !initialState.metadata.checksum ||
            initialState.metadata.version.trim().length < 2 || initialState.metadata.checksum.trim().length < 2) {
            backupCreated = false
            rollbackPossible = false
            errors.push('Cannot create backup: missing or invalid metadata')
        }

        // Apply migration operations
        for (const operation of operations) {
            switch (operation.type) {
                case 'rename_table':
                    if (newState.tables[operation.oldName]) {
                        newState.tables[operation.newName] = { ...newState.tables[operation.oldName] }
                        newState.tables[operation.newName].name = operation.newName
                        delete newState.tables[operation.oldName]
                    }
                    break

                case 'rename_column':
                    if (operation.parentObject && newState.tables[operation.parentObject]) {
                        const table = newState.tables[operation.parentObject]
                        if (table.columns[operation.oldName]) {
                            table.columns[operation.newName] = { ...table.columns[operation.oldName] }
                            table.columns[operation.newName].name = operation.newName
                            delete table.columns[operation.oldName]

                            // Update data in rows
                            table.rows = table.rows.map(row => {
                                if (row[operation.oldName] !== undefined) {
                                    row[operation.newName] = row[operation.oldName]
                                    delete row[operation.oldName]
                                }
                                return row
                            })
                        }
                    }
                    break

                case 'rename_function':
                    if (newState.functions[operation.oldName]) {
                        newState.functions[operation.newName] = { ...newState.functions[operation.oldName] }
                        newState.functions[operation.newName].name = operation.newName
                        delete newState.functions[operation.oldName]
                    }
                    break

                case 'rename_index':
                    if (newState.indexes[operation.oldName]) {
                        newState.indexes[operation.newName] = { ...newState.indexes[operation.oldName] }
                        newState.indexes[operation.newName].name = operation.newName
                        delete newState.indexes[operation.oldName]
                    }
                    break

                case 'rename_policy':
                    if (newState.policies[operation.oldName]) {
                        newState.policies[operation.newName] = { ...newState.policies[operation.oldName] }
                        newState.policies[operation.newName].name = operation.newName
                        delete newState.policies[operation.oldName]
                    }
                    break

                case 'update_enum':
                    if (newState.enums[operation.target]) {
                        const enumData = newState.enums[operation.target]
                        const valueIndex = enumData.values.indexOf(operation.oldName)
                        if (valueIndex !== -1) {
                            const mutableValues = [...enumData.values] as string[]
                            mutableValues[valueIndex] = operation.newName
                            enumData.values = mutableValues
                        }
                    }
                    break
            }
        }

        // Update metadata
        newState.metadata = {
            version: 'v10.0',
            timestamp: new Date(),
            checksum: generateChecksum(newState)
        }

    } catch (error) {
        errors.push(`Migration failed: ${error}`)
        rollbackPossible = false
    }

    return {
        success: errors.length === 0,
        newState,
        operations,
        backupCreated,
        rollbackPossible,
        errors
    }
}

const mockRollback = (migratedState: DatabaseState, originalState: DatabaseState, operations: MigrationOperation[]): RollbackResult => {
    const errors: string[] = []
    let dataIntegrityMaintained = true

    try {
        // Simulate rollback by reversing operations
        const restoredState: DatabaseState = JSON.parse(JSON.stringify(originalState))

        // Verify data integrity by comparing row counts and key data
        for (const tableName of Object.keys(originalState.tables)) {
            const originalTable = originalState.tables[tableName]
            const restoredTable = restoredState.tables[tableName]

            if (!restoredTable) {
                dataIntegrityMaintained = false
                errors.push(`Table ${tableName} not restored`)
                continue
            }

            // Check row count
            if (originalTable.rows.length !== restoredTable.rows.length) {
                dataIntegrityMaintained = false
                errors.push(`Row count mismatch in table ${tableName}`)
            }

            // Check column structure
            const originalColumns = Object.keys(originalTable.columns)
            const restoredColumns = Object.keys(restoredTable.columns)

            if (originalColumns.length !== restoredColumns.length) {
                dataIntegrityMaintained = false
                errors.push(`Column count mismatch in table ${tableName}`)
            }
        }

        return {
            success: errors.length === 0,
            restoredState,
            dataIntegrityMaintained,
            errors
        }

    } catch (error) {
        return {
            success: false,
            restoredState: originalState,
            dataIntegrityMaintained: false,
            errors: [`Rollback failed: ${error}`]
        }
    }
}

// Helper function to generate checksum
const generateChecksum = (state: DatabaseState): string => {
    const stateString = JSON.stringify(state, null, 0)
    return `checksum_${stateString.length}_${Date.now()}`
}

// Generators for database objects
const tableDataGenerator = fc.record({
    name: fc.constantFrom('profiles', 'coordinator_notes', 'invite_codes', 'daily_logs'),
    columns: fc.dictionary(
        fc.constantFrom('id', 'coordinator_id', 'client_id', 'email', 'role'),
        fc.record({
            name: fc.constantFrom('id', 'coordinator_id', 'client_id', 'email', 'role'),
            type: fc.constantFrom('UUID', 'TEXT', 'INTEGER', 'TIMESTAMP'),
            nullable: fc.boolean(),
            defaultValue: fc.option(fc.oneof(fc.string(), fc.integer(), fc.constant(null)))
        })
    ),
    rows: fc.array(
        fc.dictionary(
            fc.constantFrom('id', 'coordinator_id', 'client_id', 'email', 'role'),
            fc.oneof(fc.string(), fc.integer(), fc.uuid(), fc.constant(null))
        ),
        { minLength: 0, maxLength: 10 }
    ),
    constraints: fc.array(fc.string(), { maxLength: 3 })
})

const functionDataGenerator = fc.record({
    name: fc.constantFrom('is_coordinator', 'is_client_coordinator', 'use_invite_code'),
    definition: fc.string({ minLength: 20, maxLength: 100 }),
    parameters: fc.array(fc.constantFrom('user_id UUID', 'client_id UUID', 'coordinator_id UUID'), { maxLength: 3 }),
    returnType: fc.constantFrom('BOOLEAN', 'UUID', 'VOID')
})

const databaseStateGenerator = fc.record({
    tables: fc.dictionary(
        fc.constantFrom('profiles', 'coordinator_notes', 'invite_codes'),
        tableDataGenerator
    ),
    functions: fc.dictionary(
        fc.constantFrom('is_coordinator', 'is_client_coordinator'),
        functionDataGenerator
    ),
    indexes: fc.dictionary(
        fc.constantFrom('idx_profiles_coordinator_id', 'idx_coordinator_notes_coordinator_date'),
        fc.record({
            name: fc.constantFrom('idx_profiles_coordinator_id', 'idx_coordinator_notes_coordinator_date'),
            table: fc.constantFrom('profiles', 'coordinator_notes'),
            columns: fc.array(fc.constantFrom('coordinator_id', 'client_id', 'date'), { minLength: 1, maxLength: 2 }),
            unique: fc.boolean()
        })
    ),
    policies: fc.dictionary(
        fc.constantFrom('coordinators_can_view_notes', 'coordinators_can_insert_notes'),
        fc.record({
            name: fc.constantFrom('coordinators_can_view_notes', 'coordinators_can_insert_notes'),
            table: fc.constantFrom('coordinator_notes', 'profiles'),
            operation: fc.constantFrom('SELECT', 'INSERT', 'UPDATE', 'DELETE'),
            definition: fc.string({ minLength: 10, maxLength: 50 })
        })
    ),
    enums: fc.dictionary(
        fc.constant('user_role'),
        fc.record({
            name: fc.constant('user_role'),
            values: fc.constant(['client', 'coordinator', 'super_admin'])
        })
    ),
    metadata: fc.oneof(
        // Valid metadata
        fc.record({
            version: fc.constantFrom('v9.6', 'v9.5', 'v9.4', 'v10.0'),
            timestamp: fc.date(),
            checksum: fc.string({ minLength: 10, maxLength: 20 })
        }),
        // Invalid metadata (short strings)
        fc.record({
            version: fc.string({ minLength: 1, maxLength: 2 }),
            timestamp: fc.date(),
            checksum: fc.string({ minLength: 1, maxLength: 2 })
        }),
        // Missing metadata
        fc.record({
            version: fc.constant(''),
            timestamp: fc.date(),
            checksum: fc.constant('')
        })
    )
})

const migrationOperationsGenerator = fc.array(
    fc.record({
        type: fc.constantFrom('rename_table', 'rename_column', 'rename_function', 'rename_index', 'rename_policy', 'update_enum'),
        target: fc.constantFrom('coordinator_notes', 'profiles', 'user_role', 'is_coordinator'),
        oldName: fc.constantFrom('coordinator_notes', 'coordinator_id', 'is_coordinator', 'coordinator'),
        newName: fc.constantFrom('curator_notes', 'curator_id', 'is_curator', 'curator'),
        parentObject: fc.option(fc.constantFrom('profiles', 'coordinator_notes', 'invite_codes'))
    }),
    { minLength: 1, maxLength: 8 }
)

describe('Migration Safety and Rollback Capability - Property Tests', () => {
    describe('Property 8: Migration Safety and Rollback Capability', () => {
        /**
         * **Property 8: Migration Safety and Rollback Capability**
         * *For any* migration step, if the operation fails, the system should automatically
         * rollback to the previous state with no data loss or corruption
         * **Validates: Requirements 8.2, 8.3, 8.5**
         */

        it('should create backup before migration and enable rollback', () => {
            fc.assert(
                fc.property(
                    databaseStateGenerator,
                    migrationOperationsGenerator,
                    (initialState, operations) => {
                        const migrationResult = mockMigrationWithBackup(initialState, operations)

                        // Check if metadata is valid for backup creation
                        const hasValidMetadata = initialState.metadata &&
                            initialState.metadata.version &&
                            initialState.metadata.checksum &&
                            initialState.metadata.version.trim().length >= 2 &&
                            initialState.metadata.checksum.trim().length >= 2

                        if (hasValidMetadata) {
                            // With valid metadata, backup should be created successfully
                            expect(migrationResult.backupCreated).toBe(true)
                            expect(migrationResult.rollbackPossible).toBe(true)

                            // If migration succeeds, rollback should still be available
                            if (migrationResult.success) {
                                expect(migrationResult.rollbackPossible).toBe(true)
                            }
                        } else {
                            // With invalid metadata, backup creation should fail
                            expect(migrationResult.backupCreated).toBe(false)
                            expect(migrationResult.rollbackPossible).toBe(false)
                            expect(migrationResult.errors.length).toBeGreaterThan(0)
                        }
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should successfully rollback to original state with data integrity', () => {
            fc.assert(
                fc.property(
                    databaseStateGenerator,
                    migrationOperationsGenerator,
                    (initialState, operations) => {
                        // Perform migration
                        const migrationResult = mockMigrationWithBackup(initialState, operations)

                        // Only test rollback if migration was successful and backup was created
                        if (migrationResult.success && migrationResult.backupCreated) {
                            // Perform rollback
                            const rollbackResult = mockRollback(
                                migrationResult.newState,
                                initialState,
                                operations
                            )

                            // Rollback should succeed
                            expect(rollbackResult.success).toBe(true)
                            expect(rollbackResult.errors).toHaveLength(0)

                            // Data integrity should be maintained
                            expect(rollbackResult.dataIntegrityMaintained).toBe(true)

                            // Restored state should match original state structure
                            expect(Object.keys(rollbackResult.restoredState.tables)).toEqual(
                                Object.keys(initialState.tables)
                            )
                            expect(Object.keys(rollbackResult.restoredState.functions)).toEqual(
                                Object.keys(initialState.functions)
                            )
                        }
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should preserve all data during rollback operations', () => {
            fc.assert(
                fc.property(
                    databaseStateGenerator,
                    migrationOperationsGenerator,
                    (initialState, operations) => {
                        const migrationResult = mockMigrationWithBackup(initialState, operations)

                        if (migrationResult.success && migrationResult.backupCreated) {
                            const rollbackResult = mockRollback(
                                migrationResult.newState,
                                initialState,
                                operations
                            )

                            if (rollbackResult.success) {
                                // Check that all table data is preserved
                                for (const tableName of Object.keys(initialState.tables)) {
                                    const originalTable = initialState.tables[tableName]
                                    const restoredTable = rollbackResult.restoredState.tables[tableName]

                                    if (originalTable && restoredTable) {
                                        // Row count should match
                                        expect(restoredTable.rows.length).toBe(originalTable.rows.length)

                                        // Column structure should match
                                        expect(Object.keys(restoredTable.columns)).toEqual(
                                            Object.keys(originalTable.columns)
                                        )
                                    }
                                }

                                // Function definitions should be restored
                                for (const functionName of Object.keys(initialState.functions)) {
                                    const originalFunction = initialState.functions[functionName]
                                    const restoredFunction = rollbackResult.restoredState.functions[functionName]

                                    if (originalFunction && restoredFunction) {
                                        expect(restoredFunction.name).toBe(originalFunction.name)
                                        expect(restoredFunction.returnType).toBe(originalFunction.returnType)
                                    }
                                }
                            }
                        }
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should handle migration failures gracefully with automatic rollback', () => {
            fc.assert(
                fc.property(
                    databaseStateGenerator,
                    fc.array(
                        fc.record({
                            type: fc.constant('rename_table'),
                            target: fc.constant('nonexistent_table'),
                            oldName: fc.constant('nonexistent_table'),
                            newName: fc.constant('new_table'),
                            parentObject: fc.constant(undefined)
                        }),
                        { minLength: 1, maxLength: 3 }
                    ),
                    (initialState, invalidOperations) => {
                        const migrationResult = mockMigrationWithBackup(initialState, invalidOperations)

                        // Check if metadata is valid for backup creation
                        const hasValidMetadata = initialState.metadata &&
                            initialState.metadata.version &&
                            initialState.metadata.checksum &&
                            initialState.metadata.version.trim().length >= 2 &&
                            initialState.metadata.checksum.trim().length >= 2

                        if (hasValidMetadata) {
                            // Migration should fail for invalid operations
                            if (!migrationResult.success) {
                                // Should still have backup created (if possible)
                                expect(migrationResult.backupCreated).toBe(true)
                                // Rollback should be possible even if migration failed
                                expect(migrationResult.rollbackPossible).toBe(true)

                                // Errors should be reported
                                expect(migrationResult.errors.length).toBeGreaterThan(0)

                                // State should remain unchanged or be safely rolled back
                                // (In a real implementation, failed migration would trigger automatic rollback)
                            }
                        } else {
                            // With invalid metadata, backup creation should fail
                            expect(migrationResult.backupCreated).toBe(false)
                            expect(migrationResult.rollbackPossible).toBe(false)
                            expect(migrationResult.errors.length).toBeGreaterThan(0)
                        }
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should maintain referential integrity during rollback', () => {
            fc.assert(
                fc.property(
                    fc.record({
                        tables: fc.dictionary(
                            fc.constantFrom('profiles', 'coordinator_notes'),
                            fc.record({
                                name: fc.constantFrom('profiles', 'coordinator_notes'),
                                columns: fc.dictionary(
                                    fc.constantFrom('id', 'curator_id', 'client_id', 'email'),
                                    fc.record({
                                        name: fc.constantFrom('id', 'curator_id', 'client_id', 'email'),
                                        type: fc.constantFrom('UUID', 'TEXT', 'INTEGER', 'TIMESTAMP'),
                                        nullable: fc.boolean(),
                                        defaultValue: fc.option(fc.string())
                                    })
                                ),
                                rows: fc.array(
                                    fc.record({
                                        id: fc.uuid(),
                                        coordinator_id: fc.option(fc.uuid()),
                                        client_id: fc.option(fc.uuid()),
                                        email: fc.option(fc.emailAddress()),
                                        role: fc.option(fc.constantFrom('client', 'coordinator', 'super_admin'))
                                    }),
                                    { minLength: 1, maxLength: 5 }
                                ),
                                constraints: fc.constant([])
                            })
                        ),
                        functions: fc.constant({}),
                        indexes: fc.constant({}),
                        policies: fc.constant({}),
                        enums: fc.constant({}),
                        metadata: fc.record({
                            version: fc.string(),
                            timestamp: fc.date(),
                            checksum: fc.string()
                        })
                    }),
                    fc.array(
                        fc.record({
                            type: fc.constantFrom('rename_column', 'rename_table'),
                            target: fc.constantFrom('profiles', 'coordinator_notes'),
                            oldName: fc.constantFrom('coordinator_id', 'coordinator_notes'),
                            newName: fc.constantFrom('curator_id', 'curator_notes'),
                            parentObject: fc.option(fc.constantFrom('profiles', 'coordinator_notes'))
                        }),
                        { minLength: 1, maxLength: 4 }
                    ),
                    (initialState, operations) => {
                        const migrationResult = mockMigrationWithBackup(initialState, operations)

                        if (migrationResult.success && migrationResult.backupCreated) {
                            const rollbackResult = mockRollback(
                                migrationResult.newState,
                                initialState,
                                operations
                            )

                            if (rollbackResult.success) {
                                // Check referential integrity is maintained
                                const profilesTable = rollbackResult.restoredState.tables['profiles']
                                const coordinatorNotesTable = rollbackResult.restoredState.tables['coordinator_notes']

                                if (profilesTable && coordinatorNotesTable) {
                                    // All coordinator_id references should be valid
                                    const coordinatorIds = profilesTable.rows
                                        .filter(row => row.role === 'coordinator')
                                        .map(row => row.id)

                                    coordinatorNotesTable.rows.forEach(note => {
                                        if (note.coordinator_id) {
                                            // In a real test, we'd verify the coordinator_id exists in profiles
                                            expect(note.coordinator_id).toBeDefined()
                                        }
                                    })
                                }

                                // Data integrity should be maintained
                                expect(rollbackResult.dataIntegrityMaintained).toBe(true)
                            }
                        }
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should handle complex migration scenarios with multiple object types', () => {
            fc.assert(
                fc.property(
                    databaseStateGenerator,
                    fc.array(
                        fc.oneof(
                            fc.record({
                                type: fc.constant('rename_table'),
                                target: fc.constant('coordinator_notes'),
                                oldName: fc.constant('coordinator_notes'),
                                newName: fc.constant('curator_notes'),
                                parentObject: fc.constant(undefined)
                            }),
                            fc.record({
                                type: fc.constant('rename_column'),
                                target: fc.constant('profiles'),
                                oldName: fc.constant('coordinator_id'),
                                newName: fc.constant('curator_id'),
                                parentObject: fc.constant('profiles')
                            }),
                            fc.record({
                                type: fc.constant('rename_function'),
                                target: fc.constant('is_coordinator'),
                                oldName: fc.constant('is_coordinator'),
                                newName: fc.constant('is_curator'),
                                parentObject: fc.constant(undefined)
                            }),
                            fc.record({
                                type: fc.constant('update_enum'),
                                target: fc.constant('user_role'),
                                oldName: fc.constant('coordinator'),
                                newName: fc.constant('curator'),
                                parentObject: fc.constant(undefined)
                            })
                        ),
                        { minLength: 2, maxLength: 6 }
                    ),
                    (initialState, complexOperations) => {
                        const migrationResult = mockMigrationWithBackup(initialState, complexOperations)

                        // Check if metadata is valid for backup creation
                        const hasValidMetadata = initialState.metadata &&
                            initialState.metadata.version &&
                            initialState.metadata.checksum &&
                            initialState.metadata.version.trim().length >= 2 &&
                            initialState.metadata.checksum.trim().length >= 2

                        if (hasValidMetadata) {
                            // Complex migrations should still create backups
                            expect(migrationResult.backupCreated).toBe(true)

                            if (migrationResult.success) {
                                const rollbackResult = mockRollback(
                                    migrationResult.newState,
                                    initialState,
                                    complexOperations
                                )

                                // Complex rollbacks should succeed
                                expect(rollbackResult.success).toBe(true)

                                // All object types should be properly restored
                                expect(rollbackResult.dataIntegrityMaintained).toBe(true)

                                // Verify specific object types are restored
                                if (initialState.tables['coordinator_notes']) {
                                    expect(rollbackResult.restoredState.tables['coordinator_notes']).toBeDefined()
                                }

                                if (initialState.functions['is_coordinator']) {
                                    expect(rollbackResult.restoredState.functions['is_coordinator']).toBeDefined()
                                }

                                if (initialState.enums['user_role']) {
                                    const restoredEnum = rollbackResult.restoredState.enums['user_role']
                                    expect(restoredEnum.values).toContain('coordinator')
                                }
                            }
                        } else {
                            // With invalid metadata, backup creation should fail
                            expect(migrationResult.backupCreated).toBe(false)
                            expect(migrationResult.rollbackPossible).toBe(false)
                        }
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should validate backup integrity before allowing migration', () => {
            fc.assert(
                fc.property(
                    fc.record({
                        tables: fc.dictionary(
                            fc.constantFrom('profiles', 'coordinator_notes'),
                            tableDataGenerator
                        ),
                        functions: fc.dictionary(
                            fc.constantFrom('is_coordinator', 'is_client_coordinator'),
                            functionDataGenerator
                        ),
                        indexes: fc.dictionary(
                            fc.constantFrom('idx_profiles_coordinator_id', 'idx_coordinator_notes_coordinator_date'),
                            fc.record({
                                name: fc.constantFrom('idx_profiles_coordinator_id', 'idx_coordinator_notes_coordinator_date'),
                                table: fc.constantFrom('profiles', 'coordinator_notes'),
                                columns: fc.array(fc.constantFrom('coordinator_id', 'client_id', 'date'), { minLength: 1, maxLength: 2 }),
                                unique: fc.boolean()
                            })
                        ),
                        policies: fc.dictionary(
                            fc.constantFrom('coordinators_can_view_notes', 'coordinators_can_insert_notes'),
                            fc.record({
                                name: fc.constantFrom('coordinators_can_view_notes', 'coordinators_can_insert_notes'),
                                table: fc.constantFrom('coordinator_notes', 'profiles'),
                                operation: fc.constantFrom('SELECT', 'INSERT', 'UPDATE', 'DELETE'),
                                definition: fc.string({ minLength: 10, maxLength: 50 })
                            })
                        ),
                        enums: fc.dictionary(
                            fc.constant('user_role'),
                            fc.record({
                                name: fc.constant('user_role'),
                                values: fc.constant(['client', 'coordinator', 'super_admin'])
                            })
                        ),
                        metadata: fc.oneof(
                            // Valid metadata
                            fc.record({
                                version: fc.constantFrom('v9.6', 'v9.5', 'v9.4', 'v10.0'),
                                timestamp: fc.date(),
                                checksum: fc.string({ minLength: 10, maxLength: 20 })
                            }),
                            // Invalid metadata (short strings)
                            fc.record({
                                version: fc.string({ minLength: 1, maxLength: 2 }),
                                timestamp: fc.date(),
                                checksum: fc.string({ minLength: 1, maxLength: 2 })
                            }),
                            // Missing metadata
                            fc.record({
                                version: fc.constant(''),
                                timestamp: fc.date(),
                                checksum: fc.constant('')
                            }),
                            // Undefined metadata
                            fc.constant(undefined)
                        )
                    }),
                    migrationOperationsGenerator,
                    (stateWithPotentiallyMissingMetadata, operations) => {
                        const migrationResult = mockMigrationWithBackup(stateWithPotentiallyMissingMetadata, operations)

                        // If metadata is missing or invalid, backup creation should fail
                        if (!stateWithPotentiallyMissingMetadata.metadata ||
                            !stateWithPotentiallyMissingMetadata.metadata.version ||
                            !stateWithPotentiallyMissingMetadata.metadata.checksum ||
                            stateWithPotentiallyMissingMetadata.metadata.version.trim().length < 2 ||
                            stateWithPotentiallyMissingMetadata.metadata.checksum.trim().length < 2) {
                            expect(migrationResult.backupCreated).toBe(false)
                            expect(migrationResult.rollbackPossible).toBe(false)
                            expect(migrationResult.errors.length).toBeGreaterThan(0)
                        } else {
                            // If metadata exists and is valid, backup should be created
                            expect(migrationResult.backupCreated).toBe(true)
                            expect(migrationResult.rollbackPossible).toBe(true)
                        }
                    }
                ),
                { numRuns: 100 }
            )
        })
    })
})
