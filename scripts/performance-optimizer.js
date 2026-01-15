#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * Performance Optimizer for CI/CD Pipeline
 *
 * This script provides utilities for optimizing pipeline performance through:
 * - Incremental builds
 * - Smart caching strategies
 * - Conditional job execution
 * - Build time analysis
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class PerformanceOptimizer {
    constructor() {
        this.cacheDir = '.cache/pipeline';
        this.metricsFile = path.join(this.cacheDir, 'metrics.json');
        this.buildHashFile = path.join(this.cacheDir, 'build-hash.txt');
        this.changedFilesFile = path.join(this.cacheDir, 'changed-files.json');

        // Ensure cache directory exists
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }
    }

    /**
     * Analyze changed files to determine what needs to be rebuilt
     */
    analyzeChangedFiles(baseSha = 'HEAD~1') {
        try {
            console.log('Analyzing changed files...');

            // Get list of changed files
            const changedFiles = execSync(`git diff --name-only ${baseSha} HEAD`, { encoding: 'utf8' })
                .split('\n')
                .filter(file => file.trim() !== '');

            console.log(`Found ${changedFiles.length} changed files`);

            const analysis = {
                timestamp: new Date().toISOString(),
                baseSha,
                currentSha: execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(),
                changedFiles,
                categories: this.categorizeChanges(changedFiles),
                recommendations: this.generateRecommendations(changedFiles)
            };

            // Save analysis for later use
            fs.writeFileSync(this.changedFilesFile, JSON.stringify(analysis, null, 2));

            console.log('Change analysis:');
            console.log(`  - Source files: ${analysis.categories.source.length}`);
            console.log(`  - Test files: ${analysis.categories.tests.length}`);
            console.log(`  - Config files: ${analysis.categories.config.length}`);
            console.log(`  - Documentation: ${analysis.categories.docs.length}`);

            return analysis;
        } catch (error) {
            console.error('Error analyzing changed files:', error.message);
            return null;
        }
    }

    /**
     * Categorize changed files by type
     */
    categorizeChanges(changedFiles) {
        const categories = {
            source: [],
            tests: [],
            config: [],
            docs: [],
            workflows: [],
            dependencies: [],
            other: []
        };

        changedFiles.forEach(file => {
            if (file.match(/\.(js|jsx|ts|tsx)$/) && !file.includes('test') && !file.includes('spec')) {
                categories.source.push(file);
            } else if (file.match(/\.(test|spec)\.(js|jsx|ts|tsx)$/) || file.includes('__tests__')) {
                categories.tests.push(file);
            } else if (file.match(/\.(json|yml|yaml|toml|config\.(js|ts))$/)) {
                categories.config.push(file);
            } else if (file.match(/\.(md|txt|rst)$/)) {
                categories.docs.push(file);
            } else if (file.includes('.github/workflows')) {
                categories.workflows.push(file);
            } else if (file === 'package.json' || file === 'package-lock.json') {
                categories.dependencies.push(file);
            } else {
                categories.other.push(file);
            }
        });

        return categories;
    }

    /**
     * Generate optimization recommendations based on changed files
     */
    generateRecommendations(changedFiles) {
        const recommendations = {
            skipJobs: [],
            runJobs: [],
            optimizations: []
        };

        const categories = this.categorizeChanges(changedFiles);

        // If only docs changed, skip most jobs
        if (categories.docs.length > 0 &&
            categories.source.length === 0 &&
            categories.tests.length === 0 &&
            categories.config.length === 0) {
            recommendations.skipJobs.push('unit-tests', 'integration-tests', 'e2e-tests', 'quality-checks');
            recommendations.optimizations.push('docs-only-build');
        }

        // If only tests changed, skip E2E tests
        if (categories.tests.length > 0 && categories.source.length === 0) {
            recommendations.skipJobs.push('e2e-tests');
            recommendations.optimizations.push('test-only-run');
        }

        // If dependencies changed, clear all caches
        if (categories.dependencies.length > 0) {
            recommendations.optimizations.push('clear-dependency-cache');
        }

        // If workflows changed, run full pipeline
        if (categories.workflows.length > 0) {
            recommendations.runJobs.push('full-pipeline');
            recommendations.optimizations.push('workflow-validation');
        }

        return recommendations;
    }

    /**
     * Generate build hash for incremental builds
     */
    generateBuildHash() {
        try {
            console.log('Generating build hash...');

            // Include relevant files in hash calculation
            const relevantFiles = [
                'package.json',
                'package-lock.json',
                'tsconfig.json',
                'next.config.ts',
                'tailwind.config.js',
                'jest.config.js'
            ].filter(file => fs.existsSync(file));

            // Get git hash of source files (fallback if git command fails)
            let sourceHash = '';
            try {
                sourceHash = execSync('git ls-tree -r HEAD src/ 2>/dev/null | git hash-object --stdin 2>/dev/null || echo "no-git"', { encoding: 'utf8' }).trim();
            } catch {
                sourceHash = 'no-git-' + Date.now();
            }

            // Combine with config file hashes
            let configHash = '';
            relevantFiles.forEach(file => {
                try {
                    const content = fs.readFileSync(file, 'utf8');
                    configHash += content;
                } catch {
                    // Skip files that can't be read
                }
            });

            // Create a simple hash using Node.js crypto instead of shell commands
            const crypto = require('crypto');
            const combinedContent = sourceHash + configHash;
            const buildHash = crypto.createHash('sha256').update(combinedContent).digest('hex').substring(0, 16);

            console.log(`Build hash: ${buildHash}`);

            // Save current hash
            fs.writeFileSync(this.buildHashFile, buildHash);

            return buildHash;
        } catch (error) {
            console.error('Error generating build hash:', error.message);
            return null;
        }
    }

    /**
     * Check if incremental build is possible
     */
    canUseIncrementalBuild() {
        try {
            if (!fs.existsSync(this.buildHashFile)) {
                console.log('No previous build hash found, full build required');
                return false;
            }

            const previousHash = fs.readFileSync(this.buildHashFile, 'utf8').trim();
            const currentHash = this.generateBuildHash();

            if (previousHash === currentHash) {
                console.log('Build hash unchanged, incremental build possible');
                return true;
            } else {
                console.log('Build hash changed, full build required');
                console.log(`  Previous: ${previousHash}`);
                console.log(`  Current:  ${currentHash}`);
                return false;
            }
        } catch (error) {
            console.error('Error checking incremental build:', error.message);
            return false;
        }
    }

    /**
     * Optimize cache strategy based on file changes
     */
    optimizeCacheStrategy() {
        const analysis = JSON.parse(fs.readFileSync(this.changedFilesFile, 'utf8'));
        const cacheStrategy = {
            nodeModules: 'restore', // Default to restore
            nextCache: 'restore',
            jestCache: 'restore',
            playwrightCache: 'restore',
            eslintCache: 'restore'
        };

        // If dependencies changed, invalidate node_modules cache
        if (analysis.categories.dependencies.length > 0) {
            cacheStrategy.nodeModules = 'clear';
        }

        // If Next.js config changed, clear Next.js cache
        if (analysis.changedFiles.some(file => file.includes('next.config'))) {
            cacheStrategy.nextCache = 'clear';
        }

        // If Jest config changed, clear Jest cache
        if (analysis.changedFiles.some(file => file.includes('jest.config'))) {
            cacheStrategy.jestCache = 'clear';
        }

        // If ESLint config changed, clear ESLint cache
        if (analysis.changedFiles.some(file => file.includes('eslint.config'))) {
            cacheStrategy.eslintCache = 'clear';
        }

        return cacheStrategy;
    }

    /**
     * Generate conditional job execution matrix
     */
    generateJobMatrix() {
        const analysis = JSON.parse(fs.readFileSync(this.changedFilesFile, 'utf8'));
        const matrix = {
            runQualityChecks: true,
            runUnitTests: true,
            runIntegrationTests: true,
            runE2ETests: true,
            runSecurityScan: true,
            testGroups: []
        };

        // Determine which test groups to run based on changed files
        if (analysis.categories.source.length > 0) {
            // Analyze which components/modules were changed
            const changedComponents = this.analyzeChangedComponents(analysis.categories.source);

            if (changedComponents.includes('components')) {
                matrix.testGroups.push('components');
            }
            if (changedComponents.includes('utils')) {
                matrix.testGroups.push('utils');
            }
            if (changedComponents.includes('hooks')) {
                matrix.testGroups.push('hooks');
            }
            if (changedComponents.includes('api')) {
                matrix.testGroups.push('api');
            }
        } else {
            // If no source files changed, run all test groups
            matrix.testGroups = ['components', 'utils', 'hooks', 'api'];
        }

        // Skip E2E tests if only utility functions changed
        if (analysis.categories.source.every(file => file.includes('src/utils/')) &&
            analysis.categories.source.length > 0) {
            matrix.runE2ETests = false;
        }

        // Skip integration tests if only components changed
        if (analysis.categories.source.every(file => file.includes('src/components/')) &&
            analysis.categories.source.length > 0) {
            matrix.runIntegrationTests = false;
        }

        // Always run security scan if dependencies changed
        if (analysis.categories.dependencies.length > 0) {
            matrix.runSecurityScan = true;
        }

        return matrix;
    }

    /**
     * Analyze which components/modules were changed
     */
    analyzeChangedComponents(sourceFiles) {
        const components = new Set();

        sourceFiles.forEach(file => {
            if (file.includes('src/components/')) {
                components.add('components');
            }
            if (file.includes('src/utils/')) {
                components.add('utils');
            }
            if (file.includes('src/hooks/')) {
                components.add('hooks');
            }
            if (file.includes('src/app/api/')) {
                components.add('api');
            }
        });

        return Array.from(components);
    }

    /**
     * Record pipeline metrics for performance analysis
     */
    recordMetrics(jobName, startTime, endTime, status) {
        const duration = endTime - startTime;
        const metrics = this.loadMetrics();

        if (!metrics.jobs[jobName]) {
            metrics.jobs[jobName] = [];
        }

        metrics.jobs[jobName].push({
            timestamp: new Date().toISOString(),
            duration,
            status,
            commit: execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()
        });

        // Keep only last 50 runs per job
        if (metrics.jobs[jobName].length > 50) {
            metrics.jobs[jobName] = metrics.jobs[jobName].slice(-50);
        }

        this.saveMetrics(metrics);

        console.log(`Recorded metrics for ${jobName}: ${duration}ms (${status})`);
    }

    /**
     * Load existing metrics
     */
    loadMetrics() {
        if (fs.existsSync(this.metricsFile)) {
            return JSON.parse(fs.readFileSync(this.metricsFile, 'utf8'));
        }

        return {
            jobs: {},
            trends: {},
            lastUpdated: new Date().toISOString()
        };
    }

    /**
     * Save metrics to file
     */
    saveMetrics(metrics) {
        metrics.lastUpdated = new Date().toISOString();
        fs.writeFileSync(this.metricsFile, JSON.stringify(metrics, null, 2));
    }

    /**
     * Analyze performance trends
     */
    analyzePerformanceTrends() {
        console.log('Analyzing performance trends...');

        const metrics = this.loadMetrics();
        const trends = {};

        Object.keys(metrics.jobs).forEach(jobName => {
            const jobMetrics = metrics.jobs[jobName];
            if (jobMetrics.length < 5) return; // Need at least 5 data points

            const recentRuns = jobMetrics.slice(-10);
            const avgDuration = recentRuns.reduce((sum, run) => sum + run.duration, 0) / recentRuns.length;
            const successRate = recentRuns.filter(run => run.status === 'success').length / recentRuns.length;

            trends[jobName] = {
                averageDuration: Math.round(avgDuration),
                successRate: Math.round(successRate * 100),
                trend: this.calculateTrend(jobMetrics.slice(-20)),
                recommendations: this.generatePerformanceRecommendations(jobName, avgDuration, successRate)
            };
        });

        console.log('Performance trends:', JSON.stringify(trends, null, 2));
        return trends;
    }

    /**
     * Calculate performance trend (improving/degrading)
     */
    calculateTrend(runs) {
        if (runs.length < 10) return 'insufficient-data';

        const firstHalf = runs.slice(0, Math.floor(runs.length / 2));
        const secondHalf = runs.slice(Math.floor(runs.length / 2));

        const firstAvg = firstHalf.reduce((sum, run) => sum + run.duration, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((sum, run) => sum + run.duration, 0) / secondHalf.length;

        const change = ((secondAvg - firstAvg) / firstAvg) * 100;

        if (change > 10) return 'degrading';
        if (change < -10) return 'improving';
        return 'stable';
    }

    /**
     * Generate performance recommendations
     */
    generatePerformanceRecommendations(jobName, avgDuration, successRate) {
        const recommendations = [];

        if (avgDuration > 300000) { // 5 minutes
            recommendations.push('Consider parallelizing this job');
        }

        if (successRate < 0.9) {
            recommendations.push('Investigate frequent failures');
        }

        if (jobName.includes('test') && avgDuration > 180000) { // 3 minutes
            recommendations.push('Consider splitting test suite');
        }

        return recommendations;
    }
}

// CLI interface
if (require.main === module) {
    const optimizer = new PerformanceOptimizer();
    const command = process.argv[2];
    const args = process.argv.slice(3);

    switch (command) {
        case 'analyze':
            optimizer.analyzeChangedFiles(args[0]);
            break;

        case 'build-hash':
            optimizer.generateBuildHash();
            break;

        case 'incremental-check':
            const canIncremental = optimizer.canUseIncrementalBuild();
            process.exit(canIncremental ? 0 : 1);
            break;

        case 'cache-strategy':
            const strategy = optimizer.optimizeCacheStrategy();
            console.log(JSON.stringify(strategy));
            break;

        case 'job-matrix':
            const matrix = optimizer.generateJobMatrix();
            console.log(JSON.stringify(matrix));
            break;

        case 'record-metrics':
            const [jobName, startTime, endTime, status] = args;
            optimizer.recordMetrics(jobName, parseInt(startTime), parseInt(endTime), status);
            break;

        case 'analyze-trends':
            optimizer.analyzePerformanceTrends();
            break;

        default:
            console.log('Usage: node performance-optimizer.js <command> [args]');
            console.log('Commands:');
            console.log('  analyze [base-sha]     - Analyze changed files');
            console.log('  build-hash            - Generate build hash');
            console.log('  incremental-check     - Check if incremental build is possible');
            console.log('  cache-strategy        - Optimize cache strategy');
            console.log('  job-matrix           - Generate conditional job matrix');
            console.log('  record-metrics       - Record job metrics');
            console.log('  analyze-trends       - Analyze performance trends');
            process.exit(1);
    }
}

module.exports = PerformanceOptimizer;
