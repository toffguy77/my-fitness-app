const nextJest = require('next/jest')

const createJestConfig = nextJest({
    dir: './',
})

const customJestConfig = {
    setupFiles: ['<rootDir>/jest.polyfills.js'],
    setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
    testEnvironment: 'jest-environment-jsdom',
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
        '!src/**/__tests__/**',
    ],
    coverageThreshold: {
        global: {
            branches: 65,
            functions: 78,
            lines: 77,
            statements: 77,
        },
    },
    transformIgnorePatterns: [
        'node_modules/(?!(msw|@mswjs|until-async)/)',
    ],
}

module.exports = createJestConfig(customJestConfig)
