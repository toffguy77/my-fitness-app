#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-unused-vars */

/**
 * Quality Gate Performance Monitor
 * Tracks and optimizes quality gate execution times
 * Requirements: 6.3, 6.5 - Performance optimization and monitoring
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class QualityGatePerformanceMonitor {
    constructor() {
        this.metrics = {
            startTime: Date.now(),
            checkTimes: {},
            totalDuration: 0,
            parallelEfficiency: 0
        };
        this.performanceThresholds = {
            total: 10 * 60 * 1000, // 10 minutes max
            coverage: 5 * 60 * 1000, // 5 minutes max
            security: 2 * 60 * 1000, // 2 minutes max
            eslint: 1 * 60 * 1000, // 1 minute max
            typescript: 2 * 60 * 1000 // 2 minutes max
        };
    }

    /**
     * Start timing a quality check
     */
    startCheck(checkName) {
        this.metrics.checkTimes[checkName] = {
            start: Date.now(),
            end: null,
            duration: null
        };
        console.log(`⏱️  Starting ${checkName} check...`);
    }

    /**
     * End timing a quality check
     */
    endCheck(checkName) {
        if (!this.metrics.checkTimes[checkName]) {
            console.warn(`⚠️  Check ${checkName} was not started`);
            return;
        }

        const check = this.metrics.checkTimes[checkName];
        check.end = Date.now();
        check.duration = check.end - check.start;

        const threshold = this.performanceThresholds[checkName];
        const status = threshold && check.duration > threshold ? '⚠️' : '✅';

        console.log(`${status} ${checkName} completed in ${this.formatDuration(check.duration)}`);

        if (threshold && check.duration > threshold) {
            console.log(`   ⚠️  Exceeded threshold of ${this.formatDuration(threshold)}`);
        }
    }

    /**
     * Format duration in human readable format
     */
    formatDuration(ms) {
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
        return `${(ms / 60000).toFixed(1)}m`;
    }

    /**
     * Run optimized parallel quality checks
     */
    async runOptimizedQualityChecks() {
        console.log('🚀 Starting optimized quality gate execution...');

        // Start all checks in parallel for maximum efficiency
        const checkPromises = [
            this.runCoverageCheck(),
            this.runSecurityCheck(),
            this.runESLintCheck(),
            this.runTypeScriptCheck()
        ];

        const parallelStartTime = Date.now();

        try {
            const results = await Promise.allSettled(checkPromises);
            const parallelEndTime = Date.now();

            this.metrics.totalDuration = parallelEndTime - this.metrics.startTime;

            // Calculate parallel efficiency
            const sequentialTime = Object.values(this.metrics.checkTimes)
                .reduce((sum, check) => sum + (check.duration || 0), 0);

            this.metrics.parallelEfficiency = sequentialTime > 0
                ? ((sequentialTime - this.metrics.totalDuration) / sequentialTime) * 100
                : 0;

            this.generatePerformanceReport(results);

            // Check if any critical checks failed
            const failedChecks = results
                .map((result, index) => ({ result, check: ['coverage', 'security', 'eslint', 'typescript'][index] }))
                .filter(({ result }) => result.status === 'rejected')
                .map(({ check }) => check);

            if (failedChecks.length > 0) {
                console.log(`❌ Quality gate failed: ${failedChecks.join(', ')}`);
                process.exit(1);
            } else {
                console.log('✅ All quality checks passed!');
                process.exit(0);
            }

        } catch (error) {
            console.error('❌ Quality gate execution failed:', error);
            process.exit(1);
        }
    }

    /**
     * Run coverage check with performance monitoring
     */
    async runCoverageCheck() {
        this.startCheck('coverage');

        try {
            // Use faster coverage collection for CI
            const coverageCommand = process.env.CI
                ? 'npm run test:coverage:ci'
                : 'npm run test:coverage';

            execSync(coverageCommand, {
                stdio: 'pipe',
                timeout: this.performanceThresholds.coverage
            });

            this.endCheck('coverage');
            return { check: 'coverage', passed: true };
        } catch (error) {
            this.endCheck('coverage');
            throw new Error(`Coverage check failed: ${error.message}`);
        }
    }

    /**
     * Run security check with performance monitoring
     */
    async runSecurityCheck() {
        this.startCheck('security');

        try {
            // Use faster audit with limited output
            execSync('npm audit --audit-level high --json > audit-results.json', {
                stdio: 'pipe',
                timeout: this.performanceThresholds.security
            });

            // Quick vulnerability count check
            if (fs.existsSync('audit-results.json')) {
                const audit = JSON.parse(fs.readFileSync('audit-results.json', 'utf8'));
                const criticalVulns = audit.metadata?.vulnerabilities?.critical || 0;

                if (criticalVulns > 0) {
                    throw new Error(`Found ${criticalVulns} critical vulnerabilities`);
                }
            }

            this.endCheck('security');
            return { check: 'security', passed: true };
        } catch (error) {
            this.endCheck('security');
            throw new Error(`Security check failed: ${error.message}`);
        }
    }

    /**
     * Run ESLint check with performance monitoring
     */
    async runESLintCheck() {
        this.startCheck('eslint');

        try {
            // Use incremental ESLint if possible
            const changedFiles = this.getChangedFiles();
            const shouldUseIncremental = changedFiles.length > 0 && changedFiles.length < 50;

            let eslintCommand;
            if (shouldUseIncremental) {
                const sourceFiles = changedFiles.filter(file =>
                    file.match(/\.(ts|tsx|js|jsx)$/) && fs.existsSync(file)
                );

                if (sourceFiles.length > 0) {
                    eslintCommand = `npx eslint ${sourceFiles.join(' ')} --format=json --output-file=eslint-results.json`;
                } else {
                    // No source files changed, skip ESLint
                    this.endCheck('eslint');
                    return { check: 'eslint', passed: true, skipped: true };
                }
            } else {
                eslintCommand = 'npm run lint -- --format=json --output-file=eslint-results.json';
            }

            execSync(eslintCommand, {
                stdio: 'pipe',
                timeout: this.performanceThresholds.eslint
            });

            this.endCheck('eslint');
            return { check: 'eslint', passed: true };
        } catch (error) {
            this.endCheck('eslint');

            // Check if it's just ESLint errors (not execution failure)
            if (fs.existsSync('eslint-results.json')) {
                const results = JSON.parse(fs.readFileSync('eslint-results.json', 'utf8'));
                const errorCount = results.reduce((sum, file) => sum + file.errorCount, 0);

                if (errorCount > 0) {
                    throw new Error(`ESLint found ${errorCount} errors`);
                }
            }

            throw new Error(`ESLint check failed: ${error.message}`);
        }
    }

    /**
     * Run TypeScript check with performance monitoring
     */
    async runTypeScriptCheck() {
        this.startCheck('typescript');

        try {
            // Use incremental TypeScript compilation for better performance
            execSync('npm run type-check', {
                stdio: 'pipe',
                timeout: this.performanceThresholds.typescript
            });

            this.endCheck('typescript');
            return { check: 'typescript', passed: true };
        } catch (error) {
            this.endCheck('typescript');
            throw new Error(`TypeScript check failed: ${error.message}`);
        }
    }

    /**
     * Get changed files for incremental checks
     */
    getChangedFiles() {
        try {
            const baseBranch = process.env.GITHUB_BASE_REF || 'main';
            const headBranch = process.env.GITHUB_HEAD_REF || 'HEAD';

            let changedFiles;
            if (process.env.GITHUB_EVENT_NAME === 'pull_request') {
                changedFiles = execSync(`git diff --name-only origin/${baseBranch}...${headBranch}`, { encoding: 'utf8' });
            } else {
                changedFiles = execSync('git diff --name-only HEAD~1 HEAD', { encoding: 'utf8' });
            }

            return changedFiles.trim().split('\n').filter(file => file.length > 0);
        } catch (error) {
            return [];
        }
    }

    /**
     * Generate performance report
     */
    generatePerformanceReport(results) {
        console.log('\n📊 Quality Gate Performance Report');
        console.log('==================================');

        // Individual check performance
        Object.entries(this.metrics.checkTimes).forEach(([check, timing]) => {
            const threshold = this.performanceThresholds[check];
            const status = threshold && timing.duration > threshold ? '⚠️' : '✅';
            const efficiency = threshold ? `(${((threshold - timing.duration) / threshold * 100).toFixed(1)}% under threshold)` : '';

            console.log(`${status} ${check}: ${this.formatDuration(timing.duration)} ${efficiency}`);
        });

        // Overall performance
        console.log(`\n⏱️  Total execution time: ${this.formatDuration(this.metrics.totalDuration)}`);
        console.log(`⚡ Parallel efficiency: ${this.metrics.parallelEfficiency.toFixed(1)}% time saved`);

        // Performance recommendations
        this.generatePerformanceRecommendations();

        // Save performance metrics for tracking
        this.savePerformanceMetrics();
    }

    /**
     * Generate performance recommendations
     */
    generatePerformanceRecommendations() {
        console.log('\n💡 Performance Recommendations:');

        const slowChecks = Object.entries(this.metrics.checkTimes)
            .filter(([check, timing]) => {
                const threshold = this.performanceThresholds[check];
                return threshold && timing.duration > threshold * 0.8; // 80% of threshold
            })
            .map(([check]) => check);

        if (slowChecks.length === 0) {
            console.log('✅ All checks are performing well!');
            return;
        }

        slowChecks.forEach(check => {
            switch (check) {
                case 'coverage':
                    console.log('📊 Coverage: Consider using --changedSince for incremental coverage');
                    console.log('   Or split tests into smaller groups for parallel execution');
                    break;
                case 'security':
                    console.log('🔒 Security: Use npm audit --production to skip dev dependencies');
                    console.log('   Or cache audit results for unchanged package.json');
                    break;
                case 'eslint':
                    console.log('🎨 ESLint: Use --cache flag and incremental linting');
                    console.log('   Or configure ESLint to only check changed files');
                    break;
                case 'typescript':
                    console.log('🔧 TypeScript: Use --incremental flag for faster compilation');
                    console.log('   Or use project references for large codebases');
                    break;
            }
        });
    }

    /**
     * Save performance metrics for tracking
     */
    savePerformanceMetrics() {
        const metricsFile = path.resolve('.github/quality-gate-metrics.json');

        let historicalMetrics = [];
        if (fs.existsSync(metricsFile)) {
            try {
                historicalMetrics = JSON.parse(fs.readFileSync(metricsFile, 'utf8'));
            } catch (error) {
                console.warn('⚠️  Could not read historical metrics');
            }
        }

        const currentMetrics = {
            timestamp: new Date().toISOString(),
            commit: process.env.GITHUB_SHA || 'unknown',
            branch: process.env.GITHUB_REF_NAME || 'unknown',
            totalDuration: this.metrics.totalDuration,
            parallelEfficiency: this.metrics.parallelEfficiency,
            checkTimes: Object.fromEntries(
                Object.entries(this.metrics.checkTimes).map(([check, timing]) => [
                    check,
                    timing.duration
                ])
            )
        };

        historicalMetrics.push(currentMetrics);

        // Keep only last 100 runs
        if (historicalMetrics.length > 100) {
            historicalMetrics = historicalMetrics.slice(-100);
        }

        try {
            fs.writeFileSync(metricsFile, JSON.stringify(historicalMetrics, null, 2));
            console.log(`📈 Performance metrics saved to ${metricsFile}`);
        } catch (error) {
            console.warn('⚠️  Could not save performance metrics:', error.message);
        }
    }
}

// Run the performance-optimized quality gate
if (require.main === module) {
    const monitor = new QualityGatePerformanceMonitor();
    monitor.runOptimizedQualityChecks().catch(error => {
        console.error('❌ Performance-optimized quality gate failed:', error);
        process.exit(1);
    });
}

module.exports = QualityGatePerformanceMonitor;
