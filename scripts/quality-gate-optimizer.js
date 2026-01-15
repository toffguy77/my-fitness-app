#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-unused-vars */

/**
 * Quality Gate Optimizer
 * Advanced optimization and monitoring for CI/CD quality gates
 * Requirements: 6.3, 6.5 - Performance optimization and incremental checks
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class QualityGateOptimizer {
    constructor() {
        this.metrics = {
            startTime: Date.now(),
            checkTimes: {},
            cacheHits: {},
            optimizations: []
        };

        this.config = {
            maxParallelJobs: 4,
            memoryLimit: '2GB',
            timeoutMinutes: 10,
            cacheEnabled: true
        };
    }

    /**
     * Analyze repository for optimization opportunities
     */
    analyzeRepository() {
        console.log('🔍 Analyzing repository for optimization opportunities...');

        const analysis = {
            totalFiles: 0,
            testFiles: 0,
            sourceFiles: 0,
            configFiles: 0,
            cacheFiles: []
        };

        try {
            // Count different file types
            analysis.sourceFiles = parseInt(execSync('find src -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" | grep -v __tests__ | wc -l', { encoding: 'utf8' }).trim());
            analysis.testFiles = parseInt(execSync('find src -name "*.test.*" -o -name "*.spec.*" | wc -l', { encoding: 'utf8' }).trim());
            analysis.totalFiles = analysis.sourceFiles + analysis.testFiles;

            // Check for existing cache files
            if (fs.existsSync('.eslintcache')) {
                analysis.cacheFiles.push('eslint');
            }
            if (fs.existsSync('tsconfig.tsbuildinfo')) {
                analysis.cacheFiles.push('typescript');
            }
            if (fs.existsSync('node_modules/.cache')) {
                analysis.cacheFiles.push('jest');
            }

            console.log(`📊 Repository Analysis:`);
            console.log(`   Source files: ${analysis.sourceFiles}`);
            console.log(`   Test files: ${analysis.testFiles}`);
            console.log(`   Cache files: ${analysis.cacheFiles.join(', ') || 'none'}`);

        } catch (error) {
            console.warn('⚠️  Could not analyze repository:', error.message);
        }

        return analysis;
    }

    /**
     * Optimize ESLint configuration for CI
     */
    optimizeESLint() {
        console.log('🎨 Optimizing ESLint configuration...');

        try {
            // Enable ESLint caching
            const eslintConfig = {
                cache: true,
                cacheLocation: '.eslintcache',
                cacheStrategy: 'content'
            };

            // Check if we can use incremental linting
            const changedFiles = this.getChangedFiles();
            const sourceFiles = changedFiles.filter(file =>
                file.match(/\.(ts|tsx|js|jsx)$/) && fs.existsSync(file)
            );

            if (sourceFiles.length > 0 && sourceFiles.length < 50) {
                console.log(`⚡ Using incremental ESLint on ${sourceFiles.length} files`);
                this.metrics.optimizations.push('eslint-incremental');
                return { type: 'incremental', files: sourceFiles };
            } else {
                console.log('🔄 Using full ESLint scan');
                return { type: 'full', config: eslintConfig };
            }
        } catch (error) {
            console.warn('⚠️  ESLint optimization failed:', error.message);
            return { type: 'full' };
        }
    }

    /**
     * Optimize TypeScript compilation
     */
    optimizeTypeScript() {
        console.log('🔧 Optimizing TypeScript compilation...');

        try {
            // Check if incremental compilation is available
            const hasBuildInfo = fs.existsSync('tsconfig.tsbuildinfo');

            if (hasBuildInfo) {
                console.log('⚡ Using TypeScript incremental compilation');
                this.metrics.optimizations.push('typescript-incremental');
                return { type: 'incremental', buildInfo: true };
            } else {
                console.log('🔄 First-time TypeScript compilation');
                return { type: 'full', enableIncremental: true };
            }
        } catch (error) {
            console.warn('⚠️  TypeScript optimization failed:', error.message);
            return { type: 'full' };
        }
    }

    /**
     * Optimize test execution
     */
    optimizeTests() {
        console.log('🧪 Optimizing test execution...');

        try {
            const analysis = this.analyzeRepository();

            // Determine optimal worker count based on file count and system resources
            let maxWorkers = 2; // Conservative default

            if (analysis.testFiles < 50) {
                maxWorkers = 1; // Single worker for small test suites
            } else if (analysis.testFiles < 200) {
                maxWorkers = 2; // Dual workers for medium test suites
            } else {
                maxWorkers = Math.min(4, Math.floor(analysis.testFiles / 100)); // Scale with test count
            }

            const testConfig = {
                maxWorkers: maxWorkers,
                workerIdleMemoryLimit: this.config.memoryLimit,
                cache: true,
                onlyChanged: false // We'll handle this at the file level
            };

            console.log(`⚡ Optimized test configuration: ${maxWorkers} workers, ${this.config.memoryLimit} memory limit`);
            this.metrics.optimizations.push('test-workers-optimized');

            return testConfig;
        } catch (error) {
            console.warn('⚠️  Test optimization failed:', error.message);
            return { maxWorkers: 2 };
        }
    }

    /**
     * Get changed files for incremental processing
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
     * Run optimized quality gate with performance monitoring
     */
    async runOptimizedQualityGate() {
        console.log('🚀 Starting optimized quality gate execution...');

        const analysis = this.analyzeRepository();
        const eslintOpt = this.optimizeESLint();
        const typescriptOpt = this.optimizeTypeScript();
        const testOpt = this.optimizeTests();

        // Create optimized execution plan
        const executionPlan = {
            parallel: true,
            checks: [
                {
                    name: 'coverage',
                    command: `npm run test:coverage:ci -- --maxWorkers=${testOpt.maxWorkers} --workerIdleMemoryLimit=${testOpt.workerIdleMemoryLimit}`,
                    timeout: 300000, // 5 minutes
                    critical: true
                },
                {
                    name: 'security',
                    command: 'npm audit --production --audit-level high --json',
                    timeout: 120000, // 2 minutes
                    critical: true
                },
                {
                    name: 'eslint',
                    command: eslintOpt.type === 'incremental'
                        ? `npx eslint ${eslintOpt.files.join(' ')} --cache --format=json`
                        : 'npm run lint -- --cache --format=json',
                    timeout: 180000, // 3 minutes
                    critical: true
                },
                {
                    name: 'typescript',
                    command: typescriptOpt.type === 'incremental'
                        ? 'npx tsc --noEmit --incremental'
                        : 'npm run type-check',
                    timeout: 240000, // 4 minutes
                    critical: true
                }
            ]
        };

        console.log('📋 Execution Plan:');
        executionPlan.checks.forEach(check => {
            console.log(`   ${check.name}: ${check.command.substring(0, 60)}...`);
        });

        // Execute checks with performance monitoring
        const results = await this.executeChecksInParallel(executionPlan.checks);

        // Generate performance report
        this.generateOptimizationReport(results, analysis);

        return results;
    }

    /**
     * Execute quality checks in parallel with monitoring
     */
    async executeChecksInParallel(checks) {
        const results = {};
        const promises = checks.map(async (check) => {
            const startTime = Date.now();

            try {
                console.log(`🔄 Starting ${check.name}...`);

                const result = await this.executeWithTimeout(check.command, check.timeout);
                const duration = Date.now() - startTime;

                results[check.name] = {
                    success: true,
                    duration: duration,
                    output: result
                };

                console.log(`✅ ${check.name} completed in ${(duration / 1000).toFixed(1)}s`);

            } catch (error) {
                const duration = Date.now() - startTime;

                results[check.name] = {
                    success: false,
                    duration: duration,
                    error: error.message
                };

                console.log(`❌ ${check.name} failed after ${(duration / 1000).toFixed(1)}s`);
            }
        });

        await Promise.allSettled(promises);
        return results;
    }

    /**
     * Execute command with timeout
     */
    async executeWithTimeout(command, timeout) {
        return new Promise((resolve, reject) => {
            const child = execSync(command, {
                encoding: 'utf8',
                timeout: timeout,
                stdio: 'pipe'
            });
            resolve(child);
        });
    }

    /**
     * Generate optimization report
     */
    generateOptimizationReport(results, analysis) {
        const totalTime = Date.now() - this.metrics.startTime;

        console.log('\n📊 Quality Gate Optimization Report');
        console.log('===================================');

        // Overall performance
        console.log(`⏱️  Total execution time: ${(totalTime / 1000).toFixed(1)}s`);

        // Individual check performance
        Object.entries(results).forEach(([check, result]) => {
            const status = result.success ? '✅' : '❌';
            console.log(`${status} ${check}: ${(result.duration / 1000).toFixed(1)}s`);
        });

        // Optimizations applied
        console.log('\n⚡ Optimizations Applied:');
        if (this.metrics.optimizations.length > 0) {
            this.metrics.optimizations.forEach(opt => {
                console.log(`   ✅ ${opt}`);
            });
        } else {
            console.log('   ℹ️  No optimizations applied (full scan required)');
        }

        // Performance recommendations
        console.log('\n💡 Performance Recommendations:');

        if (totalTime > 600000) { // > 10 minutes
            console.log('   ⚠️  Consider splitting large test suites');
            console.log('   ⚠️  Enable more aggressive caching');
        }

        if (!fs.existsSync('.eslintcache')) {
            console.log('   💡 Enable ESLint caching with --cache flag');
        }

        if (!fs.existsSync('tsconfig.tsbuildinfo')) {
            console.log('   💡 Enable TypeScript incremental compilation');
        }

        // Save metrics
        this.saveOptimizationMetrics(results, analysis, totalTime);
    }

    /**
     * Save optimization metrics for tracking
     */
    saveOptimizationMetrics(results, analysis, totalTime) {
        const metricsData = {
            timestamp: new Date().toISOString(),
            commit: process.env.GITHUB_SHA || 'unknown',
            branch: process.env.GITHUB_REF_NAME || 'unknown',
            totalTime: totalTime,
            optimizations: this.metrics.optimizations,
            results: Object.fromEntries(
                Object.entries(results).map(([check, result]) => [
                    check,
                    { success: result.success, duration: result.duration }
                ])
            ),
            analysis: analysis
        };

        try {
            const metricsDir = '.github/metrics';
            if (!fs.existsSync(metricsDir)) {
                fs.mkdirSync(metricsDir, { recursive: true });
            }

            const metricsFile = path.join(metricsDir, 'optimization-metrics.json');
            let historicalMetrics = [];

            if (fs.existsSync(metricsFile)) {
                historicalMetrics = JSON.parse(fs.readFileSync(metricsFile, 'utf8'));
            }

            historicalMetrics.push(metricsData);

            // Keep only last 50 runs
            if (historicalMetrics.length > 50) {
                historicalMetrics = historicalMetrics.slice(-50);
            }

            fs.writeFileSync(metricsFile, JSON.stringify(historicalMetrics, null, 2));
            console.log(`📈 Optimization metrics saved to ${metricsFile}`);

        } catch (error) {
            console.warn('⚠️  Could not save optimization metrics:', error.message);
        }
    }
}

// CLI interface
if (require.main === module) {
    const optimizer = new QualityGateOptimizer();

    const command = process.argv[2];

    switch (command) {
        case 'analyze':
            optimizer.analyzeRepository();
            break;
        case 'optimize':
            optimizer.runOptimizedQualityGate().catch(error => {
                console.error('❌ Optimization failed:', error);
                process.exit(1);
            });
            break;
        default:
            console.log('Usage: node quality-gate-optimizer.js [analyze|optimize]');
            console.log('  analyze  - Analyze repository for optimization opportunities');
            console.log('  optimize - Run optimized quality gate');
            break;
    }
}

module.exports = QualityGateOptimizer;
