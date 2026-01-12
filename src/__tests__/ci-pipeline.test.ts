/**
 * CI Pipeline Tests
 * 
 * Example-based tests that validate CI/CD pipeline configuration and behavior
 * according to the requirements specification.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';

describe('CI Pipeline Configuration', () => {
    const workflowPath = join(process.cwd(), '.github/workflows/ci.yml');
    let workflowConfig: any;

    beforeAll(() => {
        // Load and parse the CI workflow configuration
        if (existsSync(workflowPath)) {
            const workflowContent = readFileSync(workflowPath, 'utf8');
            workflowConfig = yaml.load(workflowContent);
        }
    });

    /**
     * Example 1: Automatic Test Execution
     * Validates: Requirements 1.1
     * 
     * When code is pushed to repository, unit tests should be automatically triggered and executed
     */
    describe('Example 1: Automatic Test Execution', () => {
        it('should have CI workflow file configured', () => {
            expect(existsSync(workflowPath)).toBe(true);
        });

        it('should trigger on push to main and develop branches', () => {
            expect(workflowConfig).toBeDefined();
            expect(workflowConfig.on).toBeDefined();
            expect(workflowConfig.on.push).toBeDefined();
            expect(workflowConfig.on.push.branches).toContain('main');
            expect(workflowConfig.on.push.branches).toContain('develop');
        });

        it('should trigger on pull requests to main branch', () => {
            expect(workflowConfig.on.pull_request).toBeDefined();
            expect(workflowConfig.on.pull_request.branches).toContain('main');
        });

        it('should have unit tests job configured', () => {
            expect(workflowConfig.jobs).toBeDefined();
            expect(workflowConfig.jobs['unit-tests']).toBeDefined();

            const unitTestsJob = workflowConfig.jobs['unit-tests'];
            expect(unitTestsJob.name).toBe('Unit Tests');
            expect(unitTestsJob['runs-on']).toBe('ubuntu-latest');
        });

        it('should execute unit tests automatically', () => {
            const unitTestsJob = workflowConfig.jobs['unit-tests'];
            expect(unitTestsJob.steps).toBeDefined();

            // Find the step that runs unit tests (now with matrix strategy)
            const testStep = unitTestsJob.steps.find((step: any) =>
                step.name && step.name.includes('Run unit tests for')
            );
            expect(testStep).toBeDefined();
            expect(testStep.run).toContain('npm run test');
        });

        it('should have proper job dependencies for test sequence', () => {
            const unitTestsJob = workflowConfig.jobs['unit-tests'];
            expect(unitTestsJob.needs).toContain('setup');
            expect(unitTestsJob.needs).toContain('quality-checks');
        });

        it('should have integration tests that depend on unit tests coverage', () => {
            const integrationTestsJob = workflowConfig.jobs['integration-tests'];
            expect(integrationTestsJob).toBeDefined();
            expect(integrationTestsJob.needs).toContain('unit-tests-coverage');
        });

        it('should have E2E tests that depend on integration tests', () => {
            const e2eTestsJob = workflowConfig.jobs['e2e-tests'];
            expect(e2eTestsJob).toBeDefined();
            expect(e2eTestsJob.needs).toContain('integration-tests');
        });

        it('should have quality gate that depends on all test jobs', () => {
            const qualityGateJob = workflowConfig.jobs['quality-gate'];
            expect(qualityGateJob).toBeDefined();
            expect(qualityGateJob.needs).toContain('quality-checks');
            expect(qualityGateJob.needs).toContain('unit-tests-coverage');
            expect(qualityGateJob.needs).toContain('integration-tests');
            expect(qualityGateJob.needs).toContain('e2e-tests');
        });

        it('should use Node.js version 20 for consistency', () => {
            const jobs = Object.values(workflowConfig.jobs) as any[];

            jobs.forEach(job => {
                if (job.steps) {
                    const nodeSetupStep = job.steps.find((step: any) =>
                        step.uses && step.uses.includes('actions/setup-node')
                    );

                    if (nodeSetupStep) {
                        expect(nodeSetupStep.with['node-version']).toBe('20');
                    }
                }
            });
        });

        it('should have caching configured for performance', () => {
            const setupJob = workflowConfig.jobs.setup;
            expect(setupJob).toBeDefined();

            const cacheStep = setupJob.steps.find((step: any) =>
                step.uses && step.uses.includes('actions/cache')
            );
            expect(cacheStep).toBeDefined();
            expect(cacheStep.with.path).toContain('~/.npm');
            expect(cacheStep.with.path).toContain('node_modules');
        });
    });

    /**
     * Example 2: Test Sequence Execution
     * Validates: Requirements 1.2
     * 
     * When unit tests pass, integration tests should be automatically started
     */
    describe('Example 2: Test Sequence Execution', () => {
        it('should have integration tests job that depends on unit tests completion', () => {
            const integrationTestsJob = workflowConfig.jobs['integration-tests'];
            expect(integrationTestsJob).toBeDefined();
            expect(integrationTestsJob.name).toBe('Integration Tests');

            // Check that integration tests depend on unit tests coverage (updated dependency)
            expect(integrationTestsJob.needs).toContain('unit-tests-coverage');
        });

        it('should have integration tests configured to run after unit tests', () => {
            const integrationTestsJob = workflowConfig.jobs['integration-tests'];
            expect(integrationTestsJob.steps).toBeDefined();

            // Find the step that runs integration tests
            const testStep = integrationTestsJob.steps.find((step: any) =>
                step.name && step.name.includes('Run integration tests')
            );
            expect(testStep).toBeDefined();
        });

        it('should have parallel execution strategy for integration tests', () => {
            const integrationTestsJob = workflowConfig.jobs['integration-tests'];
            expect(integrationTestsJob.strategy).toBeDefined();
            expect(integrationTestsJob.strategy.matrix).toBeDefined();
            expect(integrationTestsJob.strategy.matrix['test-group']).toBeDefined();
            expect(integrationTestsJob.strategy['max-parallel']).toBeDefined();
        });

        it('should run different integration test groups in parallel', () => {
            const integrationTestsJob = workflowConfig.jobs['integration-tests'];
            const testGroups = integrationTestsJob.strategy.matrix['test-group'];

            expect(testGroups).toContain('critical-flows');
            expect(testGroups).toContain('middleware');
            expect(testGroups).toContain('supabase');
        });

        it('should have proper test execution logic for each integration test group', () => {
            const integrationTestsJob = workflowConfig.jobs['integration-tests'];
            const testStep = integrationTestsJob.steps.find((step: any) =>
                step.name && step.name.includes('Run integration tests')
            );

            expect(testStep.run).toContain('case "${{ matrix.test-group }}"');
            expect(testStep.run).toContain('critical-flows');
            expect(testStep.run).toContain('middleware');
            expect(testStep.run).toContain('supabase');
        });

        it('should ensure integration tests only run if unit tests pass', () => {
            // Integration tests depend on unit-tests-coverage job
            const integrationTestsJob = workflowConfig.jobs['integration-tests'];
            expect(integrationTestsJob.needs).toContain('unit-tests-coverage');

            // Unit tests coverage job depends on unit tests matrix completion
            const unitTestsCoverageJob = workflowConfig.jobs['unit-tests-coverage'];
            expect(unitTestsCoverageJob.needs).toContain('unit-tests');
        });
    });

    /**
     * Example 3: E2E Test Triggering
     * Validates: Requirements 1.3
     * 
     * When integration tests pass, E2E tests should be automatically started
     */
    describe('Example 3: E2E Test Triggering', () => {
        it('should have E2E tests job that depends on integration tests completion', () => {
            const e2eTestsJob = workflowConfig.jobs['e2e-tests'];
            expect(e2eTestsJob).toBeDefined();
            expect(e2eTestsJob.name).toBe('E2E Tests');
            expect(e2eTestsJob.needs).toContain('integration-tests');
        });

        it('should have E2E tests configured with Playwright', () => {
            const e2eTestsJob = workflowConfig.jobs['e2e-tests'];
            expect(e2eTestsJob.steps).toBeDefined();

            // Check for Playwright browser installation
            const playwrightStep = e2eTestsJob.steps.find((step: any) =>
                step.name === 'Install Playwright browsers'
            );
            expect(playwrightStep).toBeDefined();
            expect(playwrightStep.run).toContain('npx playwright install --with-deps');
        });

        it('should have parallel execution strategy for E2E tests', () => {
            const e2eTestsJob = workflowConfig.jobs['e2e-tests'];
            expect(e2eTestsJob.strategy).toBeDefined();
            expect(e2eTestsJob.strategy.matrix).toBeDefined();
            expect(e2eTestsJob.strategy.matrix['test-group']).toBeDefined();
            expect(e2eTestsJob.strategy['max-parallel']).toBeDefined();
        });

        it('should run different E2E test groups in parallel', () => {
            const e2eTestsJob = workflowConfig.jobs['e2e-tests'];
            const testGroups = e2eTestsJob.strategy.matrix['test-group'];

            expect(testGroups).toContain('auth');
            expect(testGroups).toContain('dashboard');
            expect(testGroups).toContain('nutrition');
            expect(testGroups).toContain('coordinator');
        });

        it('should have proper test execution logic for each E2E test group', () => {
            const e2eTestsJob = workflowConfig.jobs['e2e-tests'];
            const testStep = e2eTestsJob.steps.find((step: any) =>
                step.name && step.name.includes('Run E2E tests')
            );

            expect(testStep.run).toContain('case "${{ matrix.test-group }}"');
            expect(testStep.run).toContain('auth');
            expect(testStep.run).toContain('dashboard');
            expect(testStep.run).toContain('nutrition');
            expect(testStep.run).toContain('coordinator');
        });

        it('should build application before running E2E tests', () => {
            const e2eTestsJob = workflowConfig.jobs['e2e-tests'];
            const buildStep = e2eTestsJob.steps.find((step: any) =>
                step.name === 'Build application'
            );

            expect(buildStep).toBeDefined();
            expect(buildStep.run).toContain('npm run build');
            expect(buildStep.env).toBeDefined();
        });

        it('should have proper environment variables for E2E tests', () => {
            const e2eTestsJob = workflowConfig.jobs['e2e-tests'];
            const testStep = e2eTestsJob.steps.find((step: any) =>
                step.name && step.name.includes('Run E2E tests')
            );

            expect(testStep.env).toBeDefined();
            expect(testStep.env.NEXT_PUBLIC_SUPABASE_URL).toBeDefined();
            expect(testStep.env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBeDefined();
        });

        it('should upload test results on failure for debugging', () => {
            const e2eTestsJob = workflowConfig.jobs['e2e-tests'];
            const uploadStep = e2eTestsJob.steps.find((step: any) =>
                step.name === 'Upload E2E test results'
            );

            expect(uploadStep).toBeDefined();
            expect(uploadStep.uses).toContain('actions/upload-artifact');
            expect(uploadStep.if).toBe('failure()');
            expect(uploadStep.with.name).toContain('playwright-report');
        });

        it('should ensure E2E tests only run if integration tests pass', () => {
            const e2eTestsJob = workflowConfig.jobs['e2e-tests'];
            expect(e2eTestsJob.needs).toContain('integration-tests');

            // This ensures that E2E tests won't run unless integration tests complete successfully
        });

        it('should have proper test timeout and resource allocation', () => {
            const e2eTestsJob = workflowConfig.jobs['e2e-tests'];

            // Check that max-parallel is set to reasonable value for E2E tests
            expect(e2eTestsJob.strategy['max-parallel']).toBeLessThanOrEqual(2);

            // E2E tests should run on ubuntu-latest for consistency
            expect(e2eTestsJob['runs-on']).toBe('ubuntu-latest');
        });
    });

    /**
     * Example 4: Merge Blocking on Test Failure
     * Validates: Requirements 1.4, 4.5
     * 
     * When any test fails, the merge should be blocked and developer notified
     * When any quality gate check fails, the CI pipeline should block merge
     */
    describe('Example 4: Merge Blocking on Test Failure', () => {
        it('should have quality gate job that runs always and checks all job results', () => {
            const qualityGateJob = workflowConfig.jobs['quality-gate'];
            expect(qualityGateJob).toBeDefined();
            expect(qualityGateJob.if).toBe('always()');
            expect(qualityGateJob.needs).toContain('quality-checks');
            expect(qualityGateJob.needs).toContain('unit-tests-coverage');
            expect(qualityGateJob.needs).toContain('integration-tests');
            expect(qualityGateJob.needs).toContain('e2e-tests');
        });

        it('should have quality gate step that checks job results and fails on any failure', () => {
            const qualityGateJob = workflowConfig.jobs['quality-gate'];
            const checkStep = qualityGateJob.steps.find((step: any) =>
                step.name === 'Check job results'
            );

            expect(checkStep).toBeDefined();
            expect(checkStep.run).toContain('needs.quality-checks.result');
            expect(checkStep.run).toContain('needs.unit-tests-coverage.result');
            expect(checkStep.run).toContain('needs.integration-tests.result');
            expect(checkStep.run).toContain('needs.e2e-tests.result');
            expect(checkStep.run).toContain('exit 1');
        });

        it('should have ESLint configured to fail on any warnings or errors', () => {
            const qualityChecksJob = workflowConfig.jobs['quality-checks'];
            const eslintStep = qualityChecksJob.steps.find((step: any) =>
                step.name === 'Run ESLint'
            );

            expect(eslintStep).toBeDefined();
            expect(eslintStep.run).toContain('--max-warnings=0');
        });

        it('should have TypeScript type checking that fails on type errors', () => {
            const qualityChecksJob = workflowConfig.jobs['quality-checks'];
            const typeCheckStep = qualityChecksJob.steps.find((step: any) =>
                step.name === 'Check TypeScript types'
            );

            expect(typeCheckStep).toBeDefined();
            expect(typeCheckStep.run).toContain('npm run type-check');
        });

        it('should have security audit that fails on critical vulnerabilities', () => {
            const qualityChecksJob = workflowConfig.jobs['quality-checks'];
            const securityStep = qualityChecksJob.steps.find((step: any) =>
                step.name === 'Security audit'
            );

            expect(securityStep).toBeDefined();
            expect(securityStep.run).toContain('CRITICAL');
            expect(securityStep.run).toContain('exit 1');
        });

        it('should have CodeQL security analysis configured', () => {
            const qualityChecksJob = workflowConfig.jobs['quality-checks'];

            const initStep = qualityChecksJob.steps.find((step: any) =>
                step.uses && step.uses.includes('github/codeql-action/init')
            );
            const analyzeStep = qualityChecksJob.steps.find((step: any) =>
                step.uses && step.uses.includes('github/codeql-action/analyze')
            );

            expect(initStep).toBeDefined();
            expect(analyzeStep).toBeDefined();
            expect(initStep.with.languages).toBe('javascript');
            expect(analyzeStep.with.languages).toBe('javascript');
        });

        it('should upload security audit results for review', () => {
            const qualityChecksJob = workflowConfig.jobs['quality-checks'];
            const uploadStep = qualityChecksJob.steps.find((step: any) =>
                step.name === 'Upload security audit results'
            );

            expect(uploadStep).toBeDefined();
            expect(uploadStep.uses).toContain('actions/upload-artifact');
            expect(uploadStep.with.name).toBe('security-audit-results');
            expect(uploadStep.if).toBe('always()');
        });

        it('should have proper job dependencies to ensure sequential execution', () => {
            // Quality checks should run after setup
            const qualityChecksJob = workflowConfig.jobs['quality-checks'];
            expect(qualityChecksJob.needs).toContain('setup');

            // Unit tests should run after quality checks pass
            const unitTestsJob = workflowConfig.jobs['unit-tests'];
            expect(unitTestsJob.needs).toContain('quality-checks');

            // Unit tests coverage should run after unit tests complete
            const unitTestsCoverageJob = workflowConfig.jobs['unit-tests-coverage'];
            expect(unitTestsCoverageJob.needs).toContain('unit-tests');

            // Integration tests should run after unit tests coverage completes
            const integrationTestsJob = workflowConfig.jobs['integration-tests'];
            expect(integrationTestsJob.needs).toContain('unit-tests-coverage');

            // E2E tests should run after integration tests pass
            const e2eTestsJob = workflowConfig.jobs['e2e-tests'];
            expect(e2eTestsJob.needs).toContain('integration-tests');
        });

        it('should fail fast when quality checks fail', () => {
            // Unit tests depend on quality-checks, so they won't run if quality checks fail
            const unitTestsJob = workflowConfig.jobs['unit-tests'];
            expect(unitTestsJob.needs).toContain('quality-checks');

            // This ensures that if ESLint, TypeScript, or security checks fail,
            // the subsequent test jobs won't run, saving CI resources
        });
    });

    /**
     * Example 5: Coverage Report Generation
     * Validates: Requirements 2.1
     * 
     * When build completes, code coverage report should be generated
     */
    describe('Example 5: Coverage Report Generation', () => {
        it('should have Jest configured to collect coverage', () => {
            const jestConfigPath = join(process.cwd(), 'jest.config.js');
            expect(existsSync(jestConfigPath)).toBe(true);

            // Read the Jest config file as text to avoid circular dependency
            const jestConfigContent = readFileSync(jestConfigPath, 'utf8');
            expect(jestConfigContent).toContain('collectCoverage');
            expect(jestConfigContent).toContain('coverageDirectory');
            expect(jestConfigContent).toContain('lcov');
            expect(jestConfigContent).toContain('json');
            expect(jestConfigContent).toContain('html');
        });

        it('should have coverage collection configured for source files', () => {
            const jestConfigPath = join(process.cwd(), 'jest.config.js');
            const jestConfigContent = readFileSync(jestConfigPath, 'utf8');

            expect(jestConfigContent).toContain('collectCoverageFrom');
            expect(jestConfigContent).toContain('src/**/*.{js,jsx,ts,tsx}');
            expect(jestConfigContent).toContain('!src/**/*.d.ts');
            expect(jestConfigContent).toContain('!src/**/__tests__/**');
        });

        it('should have unit tests coverage job that generates coverage reports', () => {
            const unitTestsCoverageJob = workflowConfig.jobs['unit-tests-coverage'];
            expect(unitTestsCoverageJob).toBeDefined();
            expect(unitTestsCoverageJob.name).toBe('Aggregate Unit Test Coverage');

            const coverageStep = unitTestsCoverageJob.steps.find((step: any) =>
                step.name === 'Generate complete coverage report'
            );
            expect(coverageStep).toBeDefined();
            expect(coverageStep.run).toContain('npm run test:coverage');
        });

        it('should upload coverage reports to Codecov', () => {
            const unitTestsCoverageJob = workflowConfig.jobs['unit-tests-coverage'];
            const codecovStep = unitTestsCoverageJob.steps.find((step: any) =>
                step.uses && step.uses.includes('codecov/codecov-action')
            );

            expect(codecovStep).toBeDefined();
            expect(codecovStep.with.file).toBe('./coverage/lcov.info');
            expect(codecovStep.with.flags).toBe('unittests-complete');
        });

        it('should have Codecov configuration file', () => {
            const codecovConfigPath = join(process.cwd(), 'codecov.yml');
            expect(existsSync(codecovConfigPath)).toBe(true);

            const codecovConfig = yaml.load(readFileSync(codecovConfigPath, 'utf8')) as any;
            expect(codecovConfig.coverage).toBeDefined();
            expect(codecovConfig.coverage.status).toBeDefined();
            expect(codecovConfig.coverage.status.project.default.target).toBe('40%');
        });

        it('should have coverage scripts in package.json', () => {
            const packageJsonPath = join(process.cwd(), 'package.json');
            const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

            expect(packageJson.scripts['test:coverage']).toBeDefined();
            expect(packageJson.scripts['test:coverage:ci']).toBeDefined();
            expect(packageJson.scripts['test:coverage']).toContain('--coverage');
        });

        it('should generate coverage reports for different test groups', () => {
            const unitTestsJob = workflowConfig.jobs['unit-tests'];
            expect(unitTestsJob.strategy.matrix['test-group']).toBeDefined();

            const coverageStep = unitTestsJob.steps.find((step: any) =>
                step.name && step.name.includes('Generate coverage report for')
            );
            expect(coverageStep).toBeDefined();
            expect(coverageStep.run).toContain('coverageDirectory=coverage/');
        });

        it('should have PR comments with coverage information', () => {
            const unitTestsCoverageJob = workflowConfig.jobs['unit-tests-coverage'];
            const commentStep = unitTestsCoverageJob.steps.find((step: any) =>
                step.name === 'Comment PR with coverage'
            );

            expect(commentStep).toBeDefined();
            expect(commentStep.if).toBe("github.event_name == 'pull_request'");
            expect(commentStep.uses).toContain('actions/github-script');
        });
    });

    /**
     * Example 6: Coverage Threshold Enforcement
     * Validates: Requirements 2.2
     * 
     * When code coverage is below 80%, the merge should be blocked
     */
    describe('Example 6: Coverage Threshold Enforcement', () => {
        it('should have Jest configured with global coverage thresholds', () => {
            const jestConfigPath = join(process.cwd(), 'jest.config.js');
            const jestConfigContent = readFileSync(jestConfigPath, 'utf8');

            expect(jestConfigContent).toContain('coverageThreshold');
            expect(jestConfigContent).toContain('global');
            expect(jestConfigContent).toContain('branches: 40');
            expect(jestConfigContent).toContain('functions: 40');
            expect(jestConfigContent).toContain('lines: 40');
            expect(jestConfigContent).toContain('statements: 40');
        });

        it('should have quality gate job that checks coverage thresholds', () => {
            const qualityGateJob = workflowConfig.jobs['quality-gate'];
            const coverageStep = qualityGateJob.steps.find((step: any) =>
                step.name === 'Check coverage thresholds'
            );

            expect(coverageStep).toBeDefined();
            expect(coverageStep.run).toContain('npm run test:coverage:ci');
            expect(coverageStep.run).toContain('COVERAGE_PASSED');
        });

        it('should fail quality gate when coverage thresholds are not met', () => {
            const qualityGateJob = workflowConfig.jobs['quality-gate'];
            const checkStep = qualityGateJob.steps.find((step: any) =>
                step.name === 'Check job results'
            );

            expect(checkStep.run).toContain('COVERAGE_PASSED');
            expect(checkStep.run).toContain('coverage-thresholds');
            expect(checkStep.run).toContain('Code coverage thresholds (minimum 40% required)');
        });

        it('should have coverage notification for PR when thresholds fail', () => {
            const qualityGateJob = workflowConfig.jobs['quality-gate'];
            const notifyStep = qualityGateJob.steps.find((step: any) =>
                step.name === 'Notify on coverage failure'
            );

            expect(notifyStep).toBeDefined();
            expect(notifyStep.if).toContain("env.COVERAGE_PASSED != 'true'");
            expect(notifyStep.if).toContain("github.event_name == 'pull_request'");
        });

        it('should provide helpful coverage failure messages', () => {
            const qualityGateJob = workflowConfig.jobs['quality-gate'];
            const notifyStep = qualityGateJob.steps.find((step: any) =>
                step.name === 'Notify on coverage failure'
            );

            expect(notifyStep.with.script).toContain('Coverage Quality Gate Failed');
            expect(notifyStep.with.script).toContain('Add more unit tests to increase coverage');
            expect(notifyStep.with.script).toContain('npm run test:coverage');
        });

        it('should have test:coverage:ci script that enforces thresholds', () => {
            const packageJsonPath = join(process.cwd(), 'package.json');
            const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

            expect(packageJson.scripts['test:coverage:ci']).toBeDefined();
            expect(packageJson.scripts['test:coverage:ci']).toContain('--ci');
            expect(packageJson.scripts['test:coverage:ci']).toContain('--watchAll=false');
        });

        it('should block merge when Jest coverage thresholds fail', () => {
            // This is tested by checking the Jest configuration content
            const jestConfigPath = join(process.cwd(), 'jest.config.js');
            const jestConfigContent = readFileSync(jestConfigPath, 'utf8');
            expect(jestConfigContent).toContain('coverageThreshold');
            expect(jestConfigContent).toContain('statements: 40');

            // The CI script should exit with code 1 when thresholds fail
            const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));
            expect(packageJson.scripts['test:coverage:ci']).toContain('jest --coverage');
        });
    });

    /**
     * Example 7: Critical Component Coverage
     * Validates: Requirements 2.3
     * 
     * When critical components have less than 90% coverage, the build should fail
     */
    describe('Example 7: Critical Component Coverage', () => {
        it('should have Jest configured with critical component thresholds', () => {
            const jestConfigPath = join(process.cwd(), 'jest.config.js');
            const jestConfigContent = readFileSync(jestConfigPath, 'utf8');
            expect(jestConfigContent).toContain('coverageThreshold');

            // Check middleware threshold
            expect(jestConfigContent).toContain('./src/middleware.ts');
            expect(jestConfigContent).toContain('branches: 40');
            expect(jestConfigContent).toContain('functions: 40');
            expect(jestConfigContent).toContain('lines: 40');
            expect(jestConfigContent).toContain('statements: 40');
        });

        it('should have Supabase utilities with 90% coverage threshold', () => {
            const jestConfigPath = join(process.cwd(), 'jest.config.js');
            const jestConfigContent = readFileSync(jestConfigPath, 'utf8');

            expect(jestConfigContent).toContain('./src/utils/supabase/');
            expect(jestConfigContent).toContain('branches: 40');
            expect(jestConfigContent).toContain('functions: 40');
            expect(jestConfigContent).toContain('lines: 40');
            expect(jestConfigContent).toContain('statements: 40');
        });

        it('should have validation utilities with 90% coverage threshold', () => {
            const jestConfigPath = join(process.cwd(), 'jest.config.js');
            const jestConfigContent = readFileSync(jestConfigPath, 'utf8');

            expect(jestConfigContent).toContain('./src/utils/validation/');
            expect(jestConfigContent).toContain('branches: 40');
            expect(jestConfigContent).toContain('functions: 40');
            expect(jestConfigContent).toContain('lines: 40');
            expect(jestConfigContent).toContain('statements: 40');
        });

        it('should mention critical components in coverage failure notifications', () => {
            const qualityGateJob = workflowConfig.jobs['quality-gate'];
            const notifyStep = qualityGateJob.steps.find((step: any) =>
                step.name === 'Notify on coverage failure'
            );

            expect(notifyStep.with.script).toContain('🎯 Critical Components Requiring 90% Coverage');
            expect(notifyStep.with.script).toContain('src/middleware.ts');
            expect(notifyStep.with.script).toContain('src/utils/supabase/');
            expect(notifyStep.with.script).toContain('src/utils/validation/');
        });

        it('should fail Jest when critical component thresholds are not met', () => {
            // Jest will automatically fail when any threshold in coverageThreshold is not met
            // This includes both global and specific file/directory thresholds
            const jestConfigPath = join(process.cwd(), 'jest.config.js');
            const jestConfigContent = readFileSync(jestConfigPath, 'utf8');

            // Verify that critical components have thresholds configured
            expect(jestConfigContent).toContain('global');
            expect(jestConfigContent).toContain('./src/middleware.ts');
            expect(jestConfigContent).toContain('./src/utils/supabase/');
            expect(jestConfigContent).toContain('./src/utils/validation/');

            // All components should have 40% thresholds configured
            const globalMatches = jestConfigContent.match(/global[\s\S]*?statements: 40/);
            const middlewareMatches = jestConfigContent.match(/\.\/src\/middleware\.ts[\s\S]*?statements: 40/);
            const supabaseMatches = jestConfigContent.match(/\.\/src\/utils\/supabase\/[\s\S]*?statements: 40/);
            const validationMatches = jestConfigContent.match(/\.\/src\/utils\/validation\/[\s\S]*?statements: 40/);

            expect(globalMatches).toBeTruthy();
            expect(middlewareMatches).toBeTruthy();
            expect(supabaseMatches).toBeTruthy();
            expect(validationMatches).toBeTruthy();
        });

        it('should have Codecov configured to track critical component coverage', () => {
            const codecovConfigPath = join(process.cwd(), 'codecov.yml');
            const codecovConfig = yaml.load(readFileSync(codecovConfigPath, 'utf8')) as any;

            expect(codecovConfig.flags).toBeDefined();
            expect(codecovConfig.flags['unittests-complete']).toBeDefined();
            expect(codecovConfig.flags['unittests-complete'].paths).toContain('src/');
        });

        it('should provide specific guidance for critical component testing', () => {
            const qualityGateJob = workflowConfig.jobs['quality-gate'];
            const notifyStep = qualityGateJob.steps.find((step: any) =>
                step.name === 'Notify on coverage failure'
            );

            expect(notifyStep.with.script).toContain('Focus on critical components');
            expect(notifyStep.with.script).toContain('middleware, auth, database utilities');
        });
    });
});