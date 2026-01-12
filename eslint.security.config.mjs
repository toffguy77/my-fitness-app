/**
 * ESLint Security Configuration
 * Enhanced security-focused linting rules for SAST (Static Application Security Testing)
 */

import js from '@eslint/js';

export default [
    js.configs.recommended,
    {
        rules: {
            // Built-in security rules
            'no-eval': 'error',
            'no-implied-eval': 'error',
            'no-new-func': 'error',
            'no-script-url': 'error',

            // Additional security-focused rules
            'no-console': 'warn', // Prevent information leakage
            'no-debugger': 'error', // Remove debug statements
            'no-alert': 'error', // Prevent XSS via alert
        },

        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                console: 'readonly',
                process: 'readonly',
                Buffer: 'readonly',
                __dirname: 'readonly',
                __filename: 'readonly',
                module: 'readonly',
                require: 'readonly',
                exports: 'readonly',
                global: 'readonly'
            }
        }
    },
    {
        // Stricter rules for server-side code
        files: [
            'src/app/api/**/*.{js,ts}',
            'src/middleware.{js,ts}',
            'src/utils/supabase/**/*.{js,ts}',
            'src/utils/auth/**/*.{js,ts}'
        ],
        rules: {
            'no-eval': 'error',
            'no-implied-eval': 'error',
            'no-new-func': 'error'
        }
    },
    {
        // Relaxed rules for test files
        files: [
            '**/*.test.{js,ts,jsx,tsx}',
            '**/*.spec.{js,ts,jsx,tsx}',
            'src/__tests__/**/*.{js,ts,jsx,tsx}'
        ],
        rules: {
            'no-console': 'off'
        }
    },
    {
        // Configuration files
        files: [
            '*.config.{js,ts}',
            'scripts/**/*.{js,ts}'
        ],
        rules: {
            'no-console': 'off'
        }
    }
];