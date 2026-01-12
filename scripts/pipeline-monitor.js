#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-unused-vars */

/**
 * Pipeline Performance Monitor
 * 
 * This script provides comprehensive monitoring for CI/CD pipeline performance:
 * - Collects execution time metrics
 * - Monitors resource usage
 * - Sets up alerts for slow builds
 * - Generates performance reports
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class PipelineMonitor {
    constructor() {
        this.metricsDir = '.cache/pipeline-metrics';
        this.alertsFile = path.join(this.metricsDir, 'alerts.json');
        this.performanceFile = path.join(this.metricsDir, 'performance.json');
        this.resourceFile = path.join(this.metricsDir, 'resources.json');
        this.thresholdsFile = path.join(this.metricsDir, 'thresholds.json');

        // Ensure metrics directory exists
        if (!fs.existsSync(this.metricsDir)) {
            fs.mkdirSync(this.metricsDir, { recursive: true });
        }

        // Initialize default thresholds
        this.initializeThresholds();
    }

    /**
     * Initialize performance thresholds
     */
    initializeThresholds() {
        const defaultThresholds = {
            pipeline: {
                total: 600000, // 10 minutes
                warning: 480000, // 8 minutes
                critical: 720000 // 12 minutes
            },
            jobs: {
                'quality-checks': { max: 180000, warning: 120000 }, // 3 min max, 2 min warning
                'unit-tests': { max: 300000, warning: 240000 }, // 5 min max, 4 min warning
                'integration-tests': { max: 240000, warning: 180000 }, // 4 min max, 3 min warning
                'e2e-tests': { max: 600000, warning: 480000 }, // 10 min max, 8 min warning
                'build': { max: 180000, warning: 120000 }, // 3 min max, 2 min warning
                'deploy-staging': { max: 300000, warning: 240000 }, // 5 min max, 4 min warning
                'deploy-production': { max: 600000, warning: 480000 } // 10 min max, 8 min warning
            },
            resources: {
                memory: {
                    warning: 80, // 80% memory usage
                    critical: 90 // 90% memory usage
                },
                cpu: {
                    warning: 85, // 85% CPU usage
                    critical: 95 // 95% CPU usage
                },
                disk: {
                    warning: 80, // 80% disk usage
                    critical: 90 // 90% disk usage
                }
            },
            successRate: {
                warning: 85, // 85% success rate
                critical: 70 // 70% success rate
            }
        };

        if (!fs.existsSync(this.thresholdsFile)) {
            fs.writeFileSync(this.thresholdsFile, JSON.stringify(defaultThresholds, null, 2));
        }
    }

    /**
     * Start monitoring a job
     */
    startJob(jobName, runId = null) {
        const startTime = Date.now();
        const jobId = `${jobName}-${runId || Date.now()}`;

        const jobMetrics = {
            jobId,
            jobName,
            runId,
            startTime,
            status: 'running',
            resources: {
                initialMemory: this.getMemoryUsage(),
                initialCpu: this.getCpuUsage(),
                initialDisk: this.getDiskUsage()
            }
        };

        console.log(`Starting monitoring for job: ${jobName} - ID: ${jobId}`);
        console.log(`Initial resources - Memory: ${jobMetrics.resources.initialMemory}%, CPU: ${jobMetrics.resources.initialCpu}%, Disk: ${jobMetrics.resources.initialDisk}%`);

        // Save job start metrics
        this.saveJobMetrics(jobId, jobMetrics);

        return jobId;
    }

    /**
     * End monitoring a job
     */
    endJob(jobId, status = 'success', additionalMetrics = {}) {
        const endTime = Date.now();
        const jobMetrics = this.loadJobMetrics(jobId);

        if (!jobMetrics) {
            console.error(`❌ Job metrics not found for ID: ${jobId}`);
            return null;
        }

        const duration = endTime - jobMetrics.startTime;
        const finalMetrics = {
            ...jobMetrics,
            endTime,
            duration,
            status,
            resources: {
                ...jobMetrics.resources,
                finalMemory: this.getMemoryUsage(),
                finalCpu: this.getCpuUsage(),
                finalDisk: this.getDiskUsage(),
                peakMemory: additionalMetrics.peakMemory || jobMetrics.resources.initialMemory,
                peakCpu: additionalMetrics.peakCpu || jobMetrics.resources.initialCpu
            },
            ...additionalMetrics
        };

        console.log(`Job completed: ${jobMetrics.jobName}`);
        console.log(`Duration: ${this.formatDuration(duration)}`);
        console.log(`Final resources - Memory: ${finalMetrics.resources.finalMemory}%, CPU: ${finalMetrics.resources.finalCpu}%, Disk: ${finalMetrics.resources.finalDisk}%`);

        // Save final metrics
        this.saveJobMetrics(jobId, finalMetrics);

        // Check for performance issues
        this.checkPerformanceThresholds(finalMetrics);

        // Update historical data
        this.updateHistoricalMetrics(finalMetrics);

        return finalMetrics;
    }

    /**
     * Monitor resource usage during job execution
     */
    monitorResources(jobId, intervalMs = 30000) {
        const jobMetrics = this.loadJobMetrics(jobId);
        if (!jobMetrics) return;

        console.log(`Starting resource monitoring for ${jobMetrics.jobName} - interval: ${intervalMs}ms`);

        const resourceSamples = [];
        let peakMemory = jobMetrics.resources.initialMemory;
        let peakCpu = jobMetrics.resources.initialCpu;

        const monitoringInterval = setInterval(() => {
            const currentMetrics = this.loadJobMetrics(jobId);
            if (!currentMetrics || currentMetrics.status !== 'running') {
                clearInterval(monitoringInterval);
                return;
            }

            const memory = this.getMemoryUsage();
            const cpu = this.getCpuUsage();
            const disk = this.getDiskUsage();

            peakMemory = Math.max(peakMemory, memory);
            peakCpu = Math.max(peakCpu, cpu);

            const sample = {
                timestamp: Date.now(),
                memory,
                cpu,
                disk
            };

            resourceSamples.push(sample);

            // Check for resource alerts
            this.checkResourceAlerts(jobMetrics.jobName, sample);

            // Update job metrics with current peaks
            const updatedMetrics = {
                ...currentMetrics,
                resources: {
                    ...currentMetrics.resources,
                    peakMemory,
                    peakCpu,
                    samples: resourceSamples
                }
            };

            this.saveJobMetrics(jobId, updatedMetrics);

        }, intervalMs);

        return monitoringInterval;
    }

    /**
     * Get current memory usage percentage
     */
    getMemoryUsage() {
        try {
            // For GitHub Actions runners, we can estimate based on available info
            const memInfo = execSync('cat /proc/meminfo 2>/dev/null || echo "MemTotal: 7000000 kB\nMemAvailable: 5000000 kB"', { encoding: 'utf8' });

            const totalMatch = memInfo.match(/MemTotal:\s+(\d+)\s+kB/);
            const availableMatch = memInfo.match(/MemAvailable:\s+(\d+)\s+kB/);

            if (totalMatch && availableMatch) {
                const total = parseInt(totalMatch[1]);
                const available = parseInt(availableMatch[1]);
                const used = total - available;
                return Math.round((used / total) * 100);
            }

            return 50; // Default estimate
        } catch (error) {
            return 50; // Default estimate if unable to get real data
        }
    }

    /**
     * Get current CPU usage percentage
     */
    getCpuUsage() {
        try {
            // Simple CPU usage estimation for CI environment
            const loadAvg = execSync('cat /proc/loadavg 2>/dev/null || echo "1.0 1.0 1.0"', { encoding: 'utf8' });
            const load1min = parseFloat(loadAvg.split(' ')[0]);

            // Estimate CPU usage based on load average (assuming 2-core runner)
            const cpuCores = 2;
            const cpuUsage = Math.min(100, Math.round((load1min / cpuCores) * 100));

            return cpuUsage;
        } catch (error) {
            return 30; // Default estimate
        }
    }

    /**
     * Get current disk usage percentage
     */
    getDiskUsage() {
        try {
            const diskInfo = execSync('df / 2>/dev/null | tail -1 || echo "/dev/sda1 10000000 3000000 7000000 30% /"', { encoding: 'utf8' });
            const usageMatch = diskInfo.match(/(\d+)%/);

            if (usageMatch) {
                return parseInt(usageMatch[1]);
            }

            return 30; // Default estimate
        } catch (error) {
            return 30; // Default estimate
        }
    }

    /**
     * Check performance thresholds and generate alerts
     */
    checkPerformanceThresholds(jobMetrics) {
        const thresholds = this.loadThresholds();
        const jobName = jobMetrics.jobName;
        const duration = jobMetrics.duration;

        const alerts = [];

        // Check job-specific thresholds
        if (thresholds.jobs[jobName]) {
            const jobThresholds = thresholds.jobs[jobName];

            if (duration > jobThresholds.max) {
                alerts.push({
                    type: 'performance',
                    severity: 'critical',
                    job: jobName,
                    message: `Job exceeded maximum duration: ${this.formatDuration(duration)} > ${this.formatDuration(jobThresholds.max)}`,
                    duration,
                    threshold: jobThresholds.max
                });
            } else if (duration > jobThresholds.warning) {
                alerts.push({
                    type: 'performance',
                    severity: 'warning',
                    job: jobName,
                    message: `Job exceeded warning duration: ${this.formatDuration(duration)} > ${this.formatDuration(jobThresholds.warning)}`,
                    duration,
                    threshold: jobThresholds.warning
                });
            }
        }

        // Check resource thresholds
        if (jobMetrics.resources.peakMemory > thresholds.resources.memory.critical) {
            alerts.push({
                type: 'resource',
                severity: 'critical',
                job: jobName,
                resource: 'memory',
                message: `Peak memory usage exceeded critical threshold: ${jobMetrics.resources.peakMemory}% > ${thresholds.resources.memory.critical}%`,
                value: jobMetrics.resources.peakMemory,
                threshold: thresholds.resources.memory.critical
            });
        }

        if (jobMetrics.resources.peakCpu > thresholds.resources.cpu.critical) {
            alerts.push({
                type: 'resource',
                severity: 'critical',
                job: jobName,
                resource: 'cpu',
                message: `Peak CPU usage exceeded critical threshold: ${jobMetrics.resources.peakCpu}% > ${thresholds.resources.cpu.critical}%`,
                value: jobMetrics.resources.peakCpu,
                threshold: thresholds.resources.cpu.critical
            });
        }

        // Save alerts if any
        if (alerts.length > 0) {
            this.saveAlerts(alerts);
            this.logAlerts(alerts);
        }

        return alerts;
    }

    /**
     * Check resource alerts during monitoring
     */
    checkResourceAlerts(jobName, resourceSample) {
        const thresholds = this.loadThresholds();
        const alerts = [];

        if (resourceSample.memory > thresholds.resources.memory.warning) {
            alerts.push({
                type: 'resource',
                severity: resourceSample.memory > thresholds.resources.memory.critical ? 'critical' : 'warning',
                job: jobName,
                resource: 'memory',
                message: `High memory usage detected: ${resourceSample.memory}%`,
                value: resourceSample.memory,
                timestamp: resourceSample.timestamp
            });
        }

        if (resourceSample.cpu > thresholds.resources.cpu.warning) {
            alerts.push({
                type: 'resource',
                severity: resourceSample.cpu > thresholds.resources.cpu.critical ? 'critical' : 'warning',
                job: jobName,
                resource: 'cpu',
                message: `High CPU usage detected: ${resourceSample.cpu}%`,
                value: resourceSample.cpu,
                timestamp: resourceSample.timestamp
            });
        }

        if (alerts.length > 0) {
            this.saveAlerts(alerts);
        }
    }

    /**
     * Update historical performance metrics
     */
    updateHistoricalMetrics(jobMetrics) {
        const historical = this.loadHistoricalMetrics();
        const jobName = jobMetrics.jobName;

        if (!historical[jobName]) {
            historical[jobName] = [];
        }

        // Add current metrics
        historical[jobName].push({
            timestamp: jobMetrics.endTime,
            duration: jobMetrics.duration,
            status: jobMetrics.status,
            resources: {
                peakMemory: jobMetrics.resources.peakMemory,
                peakCpu: jobMetrics.resources.peakCpu,
                finalDisk: jobMetrics.resources.finalDisk
            },
            commit: this.getCurrentCommit()
        });

        // Keep only last 100 runs per job
        if (historical[jobName].length > 100) {
            historical[jobName] = historical[jobName].slice(-100);
        }

        this.saveHistoricalMetrics(historical);
    }

    /**
     * Generate performance report
     */
    generatePerformanceReport(days = 7) {
        console.log(`Generating performance report for last ${days} days...`);

        const historical = this.loadHistoricalMetrics();
        const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
        const report = {
            period: `${days} days`,
            generatedAt: new Date().toISOString(),
            summary: {},
            jobs: {},
            trends: {},
            recommendations: []
        };

        let totalRuns = 0;
        let totalSuccessful = 0;
        let totalDuration = 0;

        Object.keys(historical).forEach(jobName => {
            const jobData = historical[jobName].filter(run => run.timestamp > cutoffTime);

            if (jobData.length === 0) return;

            const successful = jobData.filter(run => run.status === 'success');
            const avgDuration = jobData.reduce((sum, run) => sum + run.duration, 0) / jobData.length;
            const successRate = (successful.length / jobData.length) * 100;

            totalRuns += jobData.length;
            totalSuccessful += successful.length;
            totalDuration += jobData.reduce((sum, run) => sum + run.duration, 0);

            report.jobs[jobName] = {
                totalRuns: jobData.length,
                successfulRuns: successful.length,
                successRate: Math.round(successRate),
                averageDuration: Math.round(avgDuration),
                minDuration: Math.min(...jobData.map(run => run.duration)),
                maxDuration: Math.max(...jobData.map(run => run.duration)),
                averageMemory: Math.round(jobData.reduce((sum, run) => sum + (run.resources.peakMemory || 0), 0) / jobData.length),
                averageCpu: Math.round(jobData.reduce((sum, run) => sum + (run.resources.peakCpu || 0), 0) / jobData.length)
            };

            // Generate trends
            report.trends[jobName] = this.calculateJobTrend(jobData);

            // Generate recommendations
            const jobRecommendations = this.generateJobRecommendations(jobName, report.jobs[jobName]);
            report.recommendations.push(...jobRecommendations);
        });

        // Overall summary
        report.summary = {
            totalRuns,
            successfulRuns: totalSuccessful,
            overallSuccessRate: Math.round((totalSuccessful / totalRuns) * 100),
            averagePipelineDuration: Math.round(totalDuration / totalRuns),
            totalPipelineTime: totalDuration
        };

        console.log('Performance Report Generated:');
        console.log(`  Total Runs: ${report.summary.totalRuns}`);
        console.log(`  Success Rate: ${report.summary.overallSuccessRate}%`);
        console.log(`  Average Duration: ${this.formatDuration(report.summary.averagePipelineDuration)}`);

        // Save report
        const reportFile = path.join(this.metricsDir, `performance-report-${Date.now()}.json`);
        fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));

        return report;
    }

    /**
     * Calculate job performance trend
     */
    calculateJobTrend(jobData) {
        if (jobData.length < 10) return 'insufficient-data';

        const sortedData = jobData.sort((a, b) => a.timestamp - b.timestamp);
        const midpoint = Math.floor(sortedData.length / 2);

        const firstHalf = sortedData.slice(0, midpoint);
        const secondHalf = sortedData.slice(midpoint);

        const firstAvg = firstHalf.reduce((sum, run) => sum + run.duration, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((sum, run) => sum + run.duration, 0) / secondHalf.length;

        const change = ((secondAvg - firstAvg) / firstAvg) * 100;

        if (change > 15) return 'degrading';
        if (change < -15) return 'improving';
        return 'stable';
    }

    /**
     * Generate job-specific recommendations
     */
    generateJobRecommendations(jobName, jobStats) {
        const recommendations = [];
        const thresholds = this.loadThresholds();

        if (jobStats.successRate < 90) {
            recommendations.push({
                job: jobName,
                type: 'reliability',
                priority: 'high',
                message: `${jobName} has low success rate (${jobStats.successRate}%). Investigate frequent failures.`
            });
        }

        if (jobStats.averageDuration > (thresholds.jobs[jobName]?.warning || 300000)) {
            recommendations.push({
                job: jobName,
                type: 'performance',
                priority: 'medium',
                message: `${jobName} is running slower than expected (${this.formatDuration(jobStats.averageDuration)}). Consider optimization.`
            });
        }

        if (jobStats.averageMemory > 80) {
            recommendations.push({
                job: jobName,
                type: 'resource',
                priority: 'medium',
                message: `${jobName} uses high memory (${jobStats.averageMemory}%). Consider memory optimization.`
            });
        }

        return recommendations;
    }

    /**
     * Save job metrics
     */
    saveJobMetrics(jobId, metrics) {
        const metricsFile = path.join(this.metricsDir, `job-${jobId}.json`);
        fs.writeFileSync(metricsFile, JSON.stringify(metrics, null, 2));
    }

    /**
     * Load job metrics
     */
    loadJobMetrics(jobId) {
        const metricsFile = path.join(this.metricsDir, `job-${jobId}.json`);
        if (fs.existsSync(metricsFile)) {
            return JSON.parse(fs.readFileSync(metricsFile, 'utf8'));
        }
        return null;
    }

    /**
     * Save alerts
     */
    saveAlerts(alerts) {
        let existingAlerts = [];
        if (fs.existsSync(this.alertsFile)) {
            existingAlerts = JSON.parse(fs.readFileSync(this.alertsFile, 'utf8'));
        }

        const timestampedAlerts = alerts.map(alert => ({
            ...alert,
            timestamp: alert.timestamp || Date.now(),
            id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        }));

        existingAlerts.push(...timestampedAlerts);

        // Keep only last 1000 alerts
        if (existingAlerts.length > 1000) {
            existingAlerts = existingAlerts.slice(-1000);
        }

        fs.writeFileSync(this.alertsFile, JSON.stringify(existingAlerts, null, 2));
    }

    /**
     * Log alerts to console
     */
    logAlerts(alerts) {
        alerts.forEach(alert => {
            const icon = alert.severity === 'critical' ? 'CRITICAL' : 'WARNING';
            console.log(`${icon}: ${alert.message}`);
        });
    }

    /**
     * Load thresholds
     */
    loadThresholds() {
        return JSON.parse(fs.readFileSync(this.thresholdsFile, 'utf8'));
    }

    /**
     * Load historical metrics
     */
    loadHistoricalMetrics() {
        if (fs.existsSync(this.performanceFile)) {
            return JSON.parse(fs.readFileSync(this.performanceFile, 'utf8'));
        }
        return {};
    }

    /**
     * Save historical metrics
     */
    saveHistoricalMetrics(metrics) {
        fs.writeFileSync(this.performanceFile, JSON.stringify(metrics, null, 2));
    }

    /**
     * Get current git commit
     */
    getCurrentCommit() {
        try {
            return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
        } catch (error) {
            return 'unknown';
        }
    }

    /**
     * Format duration in human-readable format
     */
    formatDuration(ms) {
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return `${minutes}m ${seconds}s`;
    }

    /**
     * Clean up old metrics files
     */
    cleanup(daysToKeep = 30) {
        console.log(`Cleaning up metrics older than ${daysToKeep} days...`);

        const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
        const files = fs.readdirSync(this.metricsDir);

        let cleanedCount = 0;
        files.forEach(file => {
            const filePath = path.join(this.metricsDir, file);
            const stats = fs.statSync(filePath);

            if (stats.mtime.getTime() < cutoffTime && file.startsWith('job-')) {
                fs.unlinkSync(filePath);
                cleanedCount++;
            }
        });

        console.log(`Cleaned up ${cleanedCount} old metric files`);
    }
}

// CLI interface
if (require.main === module) {
    const monitor = new PipelineMonitor();
    const command = process.argv[2];
    const args = process.argv.slice(3);

    switch (command) {
        case 'start':
            const [jobName, runId] = args;
            // Temporarily suppress console output during job start
            const originalLog = console.log;
            console.log = () => { }; // Suppress output
            const jobId = monitor.startJob(jobName, runId);
            console.log = originalLog; // Restore console.log
            console.log(jobId); // Output only job ID for use in scripts
            break;

        case 'end':
            const [endJobId, status] = args;
            // Temporarily suppress console output during job end
            const originalLogEnd = console.log;
            console.log = () => { }; // Suppress output
            monitor.endJob(endJobId, status);
            console.log = originalLogEnd; // Restore console.log
            console.log('Job completed'); // Simple output for tests
            break;

        case 'monitor':
            const [monitorJobId, interval] = args;
            monitor.monitorResources(monitorJobId, parseInt(interval) || 30000);
            break;

        case 'report':
            const days = parseInt(args[0]) || 7;
            monitor.generatePerformanceReport(days);
            break;

        case 'cleanup':
            const keepDays = parseInt(args[0]) || 30;
            monitor.cleanup(keepDays);
            break;

        case 'alerts':
            // Show recent alerts
            const alertsFile = path.join(monitor.metricsDir, 'alerts.json');
            if (fs.existsSync(alertsFile)) {
                const alerts = JSON.parse(fs.readFileSync(alertsFile, 'utf8'));
                const recentAlerts = alerts.slice(-10);
                console.log('Recent Alerts:');
                recentAlerts.forEach(alert => {
                    const date = new Date(alert.timestamp).toISOString();
                    console.log(`  ${date} - ${alert.severity}: ${alert.message}`);
                });
            } else {
                console.log('No alerts found');
            }
            break;

        default:
            console.log('Usage: node pipeline-monitor.js <command> [args]');
            console.log('Commands:');
            console.log('  start <job-name> [run-id]     - Start monitoring a job');
            console.log('  end <job-id> [status]         - End monitoring a job');
            console.log('  monitor <job-id> [interval]   - Monitor resources for a job');
            console.log('  report [days]                 - Generate performance report');
            console.log('  cleanup [days-to-keep]        - Clean up old metrics');
            console.log('  alerts                        - Show recent alerts');
            process.exit(1);
    }
}

module.exports = PipelineMonitor;