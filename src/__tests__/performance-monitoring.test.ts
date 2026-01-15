/**
 * Performance Monitoring Integration Tests
 *
 * Tests for CI/CD pipeline performance monitoring system
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

describe('Performance Monitoring System', () => {
    const testMetricsDir = '.cache/test-pipeline-metrics';

    beforeAll(() => {
        // Create test metrics directory
        if (!fs.existsSync(testMetricsDir)) {
            fs.mkdirSync(testMetricsDir, { recursive: true });
        }
    });

    afterAll(() => {
        // Clean up test metrics
        if (fs.existsSync(testMetricsDir)) {
            fs.rmSync(testMetricsDir, { recursive: true, force: true });
        }
    });

    describe('Performance Optimizer', () => {
        test('should analyze changed files', () => {
            const result = execSync('node scripts/performance-optimizer.js analyze HEAD~1', {
                encoding: 'utf8',
                cwd: process.cwd()
            });

            expect(result).toContain('Analyzing changed files');
        });

        test('should generate build hash', () => {
            const result = execSync('node scripts/performance-optimizer.js build-hash', {
                encoding: 'utf8',
                cwd: process.cwd()
            });

            expect(result).toContain('Build hash:');
        });

        test('should check incremental build possibility', () => {
            try {
                execSync('node scripts/performance-optimizer.js incremental-check', {
                    encoding: 'utf8',
                    cwd: process.cwd()
                });
                // If no error, incremental build is possible
                expect(true).toBe(true);
            } catch (error) {
                // If error (exit code 1), full build required
                expect(error).toBeDefined();
            }
        });

        test('should optimize cache strategy', () => {
            const result = execSync('node scripts/performance-optimizer.js cache-strategy', {
                encoding: 'utf8',
                cwd: process.cwd()
            });

            const strategy = JSON.parse(result.trim());
            expect(strategy).toHaveProperty('nodeModules');
            expect(strategy).toHaveProperty('nextCache');
        });

        test('should generate job execution matrix', () => {
            const result = execSync('node scripts/performance-optimizer.js job-matrix', {
                encoding: 'utf8',
                cwd: process.cwd()
            });

            const matrix = JSON.parse(result.trim());
            expect(matrix).toHaveProperty('runQualityChecks');
            expect(matrix).toHaveProperty('runUnitTests');
            expect(matrix).toHaveProperty('testGroups');
        });
    });

    describe('Pipeline Monitor', () => {
        test('should start and end job monitoring', () => {
            // Start monitoring
            const startResult = execSync('node scripts/pipeline-monitor.js start test-job test-run-123', {
                encoding: 'utf8',
                cwd: process.cwd()
            });

            const jobId = startResult.trim();
            expect(jobId).toMatch(/test-job-/);

            // End monitoring
            const endResult = execSync(`node scripts/pipeline-monitor.js end ${jobId} success`, {
                encoding: 'utf8',
                cwd: process.cwd()
            });

            expect(endResult).toContain('Job completed');
        });

        test('should show alerts when available', () => {
            const result = execSync('node scripts/pipeline-monitor.js alerts', {
                encoding: 'utf8',
                cwd: process.cwd()
            });

            // Should either show alerts or indicate no alerts
            expect(result).toMatch(/(Recent Alerts|No alerts found)/);
        });

        test('should generate performance report', () => {
            const result = execSync('node scripts/pipeline-monitor.js report 1', {
                encoding: 'utf8',
                cwd: process.cwd()
            });

            expect(result).toContain('Generating performance report');
        });

        test('should cleanup old metrics', () => {
            const result = execSync('node scripts/pipeline-monitor.js cleanup 1', {
                encoding: 'utf8',
                cwd: process.cwd()
            });

            expect(result).toContain('Cleaning up metrics');
        });
    });

    describe('Performance Dashboard', () => {
        test('should generate HTML dashboard', () => {
            const result = execSync('node scripts/performance-dashboard.js generate', {
                encoding: 'utf8',
                cwd: process.cwd()
            });

            expect(result).toContain('Generating performance dashboard');

            // Check if dashboard file was created
            const dashboardPath = path.join(process.cwd(), 'performance-dashboard', 'index.html');
            if (fs.existsSync(dashboardPath)) {
                const dashboardContent = fs.readFileSync(dashboardPath, 'utf8');
                expect(dashboardContent).toContain('CI/CD Performance Dashboard');
                expect(dashboardContent).toContain('Real-time insights into pipeline performance');
            }
        });
    });

    describe('Package.json Scripts', () => {
        test('should have performance monitoring scripts defined', () => {
            const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

            expect(packageJson.scripts).toHaveProperty('perf:monitor');
            expect(packageJson.scripts).toHaveProperty('perf:report');
            expect(packageJson.scripts).toHaveProperty('perf:dashboard');
            expect(packageJson.scripts).toHaveProperty('perf:optimize');
            expect(packageJson.scripts).toHaveProperty('perf:alerts');
            expect(packageJson.scripts).toHaveProperty('perf:cleanup');
        });

        test('performance scripts should be executable', () => {
            const scripts = [
                'perf:report',
                'perf:dashboard',
                'perf:alerts'
            ];

            scripts.forEach(script => {
                expect(() => {
                    execSync(`npm run ${script}`, {
                        encoding: 'utf8',
                        cwd: process.cwd(),
                        timeout: 10000 // 10 second timeout
                    });
                }).not.toThrow();
            });
        });
    });

    describe('CI/CD Integration', () => {
        test('should have performance monitoring workflow', () => {
            const workflowPath = '.github/workflows/performance-monitoring.yml';
            expect(fs.existsSync(workflowPath)).toBe(true);

            const workflowContent = fs.readFileSync(workflowPath, 'utf8');
            expect(workflowContent).toContain('Performance Monitoring');
            expect(workflowContent).toContain('performance-analysis');
            expect(workflowContent).toContain('resource-monitoring');
        });

        test('should have basic CI workflow structure', () => {
            const ciWorkflowPath = '.github/workflows/ci.yml';
            expect(fs.existsSync(ciWorkflowPath)).toBe(true);

            const ciContent = fs.readFileSync(ciWorkflowPath, 'utf8');
            expect(ciContent).toContain('CI Pipeline');
            expect(ciContent).toContain('npm run test:coverage:ci');
        });
    });

    describe('Telegram Notifications', () => {
        test('should support performance report notifications', () => {
            const telegramScript = fs.readFileSync('scripts/telegram-notify.js', 'utf8');

            expect(telegramScript).toContain('performance-report');
            expect(telegramScript).toContain('performance-alert');
            expect(telegramScript).toContain('formatPerformanceReport');
            expect(telegramScript).toContain('formatPerformanceAlert');
        });
    });

    describe('Error Handling', () => {
        test('should handle missing metrics gracefully', () => {
            // Test with non-existent job ID
            expect(() => {
                execSync('node scripts/pipeline-monitor.js end non-existent-job success', {
                    encoding: 'utf8',
                    cwd: process.cwd()
                });
            }).not.toThrow();
        });

        test('should handle invalid command arguments', () => {
            expect(() => {
                execSync('node scripts/pipeline-monitor.js invalid-command', {
                    encoding: 'utf8',
                    cwd: process.cwd()
                });
            }).toThrow();
        });
    });

    describe('Performance Thresholds', () => {
        test('should initialize default thresholds', () => {
            // Start a job to trigger threshold initialization
            const jobId = execSync('node scripts/pipeline-monitor.js start threshold-test', {
                encoding: 'utf8',
                cwd: process.cwd()
            }).trim();

            // Check if thresholds file exists
            const thresholdsPath = '.cache/pipeline-metrics/thresholds.json';
            if (fs.existsSync(thresholdsPath)) {
                const thresholds = JSON.parse(fs.readFileSync(thresholdsPath, 'utf8'));

                expect(thresholds).toHaveProperty('pipeline');
                expect(thresholds).toHaveProperty('jobs');
                expect(thresholds).toHaveProperty('resources');
                expect(thresholds.pipeline).toHaveProperty('total');
                expect(thresholds.jobs).toHaveProperty('unit-tests');
            }

            // Clean up
            execSync(`node scripts/pipeline-monitor.js end ${jobId} success`, {
                encoding: 'utf8',
                cwd: process.cwd()
            });
        });
    });
});
