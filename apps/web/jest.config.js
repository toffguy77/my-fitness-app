const nextJest = require('next/jest')

const createJestConfig = nextJest({
    dir: './',
})

const customJestConfig = {
    setupFiles: ['<rootDir>/jest.polyfills.js'],
    setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
    testEnvironment: 'jest-environment-jsdom',
    workerIdleMemoryLimit: '512MB',
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
    },
    testMatch: [
        '**/__tests__/**/*.[jt]s?(x)',
        '**/?(*.)+(spec|test).[jt]s?(x)'
    ],
    collectCoverageFrom: [
        'src/**/*.{js,jsx,ts,tsx}',
        '!src/**/*.d.ts',
        '!src/**/*.stories.{js,jsx,ts,tsx}',
        '!src/**/*.example.{js,jsx,ts,tsx}',
        '!src/**/__tests__/**',
        '!src/**/testing/**',
    ],
    coverageThreshold: {
        global: {
            branches: 79,
            functions: 85,
            lines: 87,
            statements: 84,
        },
    },
    transformIgnorePatterns: [
        'node_modules/(?!(msw|@mswjs|until-async)/)',
    ],
}

module.exports = createJestConfig(customJestConfig)
