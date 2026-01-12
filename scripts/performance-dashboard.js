#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * Performance Dashboard Generator
 * 
 * Generates HTML dashboard for CI/CD pipeline performance metrics
 */

const fs = require('fs');
const path = require('path');

class PerformanceDashboard {
    constructor() {
        this.metricsDir = '.cache/pipeline-metrics';
        this.outputDir = 'performance-dashboard';

        // Ensure output directory exists
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
    }

    /**
     * Generate complete performance dashboard
     */
    generateDashboard() {
        console.log('Generating performance dashboard...');

        const data = this.loadAllMetrics();
        const html = this.generateHTML(data);

        const outputFile = path.join(this.outputDir, 'index.html');
        fs.writeFileSync(outputFile, html);

        console.log(`Dashboard generated: ${outputFile}`);
        return outputFile;
    }

    /**
     * Load all performance metrics
     */
    loadAllMetrics() {
        const data = {
            summary: {},
            jobs: {},
            trends: {},
            alerts: [],
            reports: []
        };

        if (!fs.existsSync(this.metricsDir)) {
            return data;
        }

        // Load historical metrics
        const performanceFile = path.join(this.metricsDir, 'performance.json');
        if (fs.existsSync(performanceFile)) {
            data.jobs = JSON.parse(fs.readFileSync(performanceFile, 'utf8'));
        }

        // Load alerts
        const alertsFile = path.join(this.metricsDir, 'alerts.json');
        if (fs.existsSync(alertsFile)) {
            data.alerts = JSON.parse(fs.readFileSync(alertsFile, 'utf8'));
        }

        // Load recent reports
        const reportFiles = fs.readdirSync(this.metricsDir)
            .filter(f => f.startsWith('performance-report-'))
            .sort()
            .slice(-5); // Last 5 reports

        reportFiles.forEach(file => {
            const reportPath = path.join(this.metricsDir, file);
            const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
            data.reports.push(report);
        });

        // Calculate summary statistics
        data.summary = this.calculateSummaryStats(data);

        return data;
    }

    /**
     * Calculate summary statistics
     */
    calculateSummaryStats(data) {
        const summary = {
            totalJobs: Object.keys(data.jobs).length,
            totalRuns: 0,
            averageDuration: 0,
            successRate: 0,
            criticalAlerts: 0,
            lastWeekTrend: 'stable'
        };

        // Calculate from job data
        Object.values(data.jobs).forEach(jobRuns => {
            summary.totalRuns += jobRuns.length;

            const successful = jobRuns.filter(run => run.status === 'success').length;
            const totalDuration = jobRuns.reduce((sum, run) => sum + run.duration, 0);

            summary.averageDuration += totalDuration;
            summary.successRate += successful;
        });

        if (summary.totalRuns > 0) {
            summary.averageDuration = Math.round(summary.averageDuration / summary.totalRuns);
            summary.successRate = Math.round((summary.successRate / summary.totalRuns) * 100);
        }

        // Count critical alerts in last 7 days
        const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        summary.criticalAlerts = data.alerts.filter(alert =>
            alert.timestamp > weekAgo && alert.severity === 'critical'
        ).length;

        return summary;
    }

    /**
     * Generate HTML dashboard
     */
    generateHTML(data) {
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CI/CD Performance Dashboard</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f5f7fa;
            color: #333;
            line-height: 1.6;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }
        
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            border-radius: 10px;
            margin-bottom: 30px;
            text-align: center;
        }
        
        .header h1 {
            font-size: 2.5em;
            margin-bottom: 10px;
        }
        
        .header p {
            font-size: 1.1em;
            opacity: 0.9;
        }
        
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        
        .stat-card {
            background: white;
            padding: 25px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            text-align: center;
            transition: transform 0.2s;
        }
        
        .stat-card:hover {
            transform: translateY(-2px);
        }
        
        .stat-value {
            font-size: 2.5em;
            font-weight: bold;
            margin-bottom: 10px;
        }
        
        .stat-label {
            color: #666;
            font-size: 0.9em;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        
        .success { color: #27ae60; }
        .warning { color: #f39c12; }
        .danger { color: #e74c3c; }
        .info { color: #3498db; }
        
        .section {
            background: white;
            margin-bottom: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        
        .section-header {
            background: #f8f9fa;
            padding: 20px;
            border-bottom: 1px solid #e9ecef;
        }
        
        .section-header h2 {
            font-size: 1.5em;
            color: #333;
        }
        
        .section-content {
            padding: 20px;
        }
        
        .job-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
        }
        
        .job-card {
            border: 1px solid #e9ecef;
            border-radius: 8px;
            padding: 20px;
            background: #f8f9fa;
        }
        
        .job-name {
            font-weight: bold;
            font-size: 1.1em;
            margin-bottom: 15px;
            color: #333;
        }
        
        .job-stats {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            font-size: 0.9em;
        }
        
        .job-stat {
            display: flex;
            justify-content: space-between;
        }
        
        .alert-item {
            padding: 15px;
            margin-bottom: 10px;
            border-radius: 8px;
            border-left: 4px solid;
        }
        
        .alert-critical {
            background: #fdf2f2;
            border-color: #e74c3c;
        }
        
        .alert-warning {
            background: #fefbf3;
            border-color: #f39c12;
        }
        
        .alert-time {
            font-size: 0.8em;
            color: #666;
            margin-top: 5px;
        }
        
        .trend-up { color: #27ae60; }
        .trend-down { color: #e74c3c; }
        .trend-stable { color: #95a5a6; }
        
        .chart-placeholder {
            height: 200px;
            background: #f8f9fa;
            border: 2px dashed #dee2e6;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #6c757d;
            border-radius: 8px;
        }
        
        .footer {
            text-align: center;
            padding: 20px;
            color: #666;
            font-size: 0.9em;
        }
        
        @media (max-width: 768px) {
            .container {
                padding: 10px;
            }
            
            .header {
                padding: 20px;
            }
            
            .header h1 {
                font-size: 2em;
            }
            
            .stats-grid {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>CI/CD Performance Dashboard</h1>
            <p>Real-time insights into pipeline performance and reliability</p>
            <p><small>Generated: ${new Date().toLocaleString()}</small></p>
        </div>
        
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-value success">${data.summary.totalRuns}</div>
                <div class="stat-label">Total Runs</div>
            </div>
            <div class="stat-card">
                <div class="stat-value ${data.summary.successRate >= 90 ? 'success' : data.summary.successRate >= 80 ? 'warning' : 'danger'}">${data.summary.successRate}%</div>
                <div class="stat-label">Success Rate</div>
            </div>
            <div class="stat-card">
                <div class="stat-value info">${this.formatDuration(data.summary.averageDuration)}</div>
                <div class="stat-label">Avg Duration</div>
            </div>
            <div class="stat-card">
                <div class="stat-value ${data.summary.criticalAlerts > 0 ? 'danger' : 'success'}">${data.summary.criticalAlerts}</div>
                <div class="stat-label">Critical Alerts (7d)</div>
            </div>
        </div>
        
        <div class="section">
            <div class="section-header">
                <h2>Job Performance</h2>
            </div>
            <div class="section-content">
                <div class="job-grid">
                    ${this.generateJobCards(data.jobs)}
                </div>
            </div>
        </div>
        
        <div class="section">
            <div class="section-header">
                <h2>Recent Alerts</h2>
            </div>
            <div class="section-content">
                ${this.generateAlertsSection(data.alerts)}
            </div>
        </div>
        
        <div class="section">
            <div class="section-header">
                <h2>Performance Trends</h2>
            </div>
            <div class="section-content">
                <div class="chart-placeholder">
                    Performance trend charts would be displayed here<br>
                    <small>(Integration with Chart.js or similar library)</small>
                </div>
            </div>
        </div>
        
        <div class="section">
            <div class="section-header">
                <h2>Recent Reports</h2>
            </div>
            <div class="section-content">
                ${this.generateReportsSection(data.reports)}
            </div>
        </div>
    </div>
    
    <div class="footer">
        <p>CI/CD Performance Dashboard • Updated automatically with each pipeline run</p>
    </div>
</body>
</html>`;
    }

    /**
     * Generate job performance cards
     */
    generateJobCards(jobs) {
        if (Object.keys(jobs).length === 0) {
            return '<p>No job performance data available yet.</p>';
        }

        return Object.entries(jobs).map(([jobName, runs]) => {
            if (runs.length === 0) return '';

            const recentRuns = runs.slice(-10);
            const avgDuration = recentRuns.reduce((sum, run) => sum + run.duration, 0) / recentRuns.length;
            const successRate = (recentRuns.filter(run => run.status === 'success').length / recentRuns.length) * 100;
            const trend = this.calculateTrend(runs);

            return `
                <div class="job-card">
                    <div class="job-name">${jobName}</div>
                    <div class="job-stats">
                        <div class="job-stat">
                            <span>Avg Duration:</span>
                            <span>${this.formatDuration(avgDuration)}</span>
                        </div>
                        <div class="job-stat">
                            <span>Success Rate:</span>
                            <span class="${successRate >= 90 ? 'success' : successRate >= 80 ? 'warning' : 'danger'}">${Math.round(successRate)}%</span>
                        </div>
                        <div class="job-stat">
                            <span>Total Runs:</span>
                            <span>${runs.length}</span>
                        </div>
                        <div class="job-stat">
                            <span>Trend:</span>
                            <span class="trend-${trend}">${trend}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * Generate alerts section
     */
    generateAlertsSection(alerts) {
        if (alerts.length === 0) {
            return '<p class="success">No recent alerts</p>';
        }

        const recentAlerts = alerts.slice(-10).reverse();

        return recentAlerts.map(alert => `
            <div class="alert-item alert-${alert.severity}">
                <strong>${alert.severity.toUpperCase()}: ${alert.job || 'System'}</strong>
                <div>${alert.message}</div>
                <div class="alert-time">${new Date(alert.timestamp).toLocaleString()}</div>
            </div>
        `).join('');
    }

    /**
     * Generate reports section
     */
    generateReportsSection(reports) {
        if (reports.length === 0) {
            return '<p>No performance reports available yet.</p>';
        }

        return reports.reverse().map(report => `
            <div style="margin-bottom: 20px; padding: 15px; border: 1px solid #e9ecef; border-radius: 8px;">
                <h4>Report: ${report.period} (${new Date(report.generatedAt).toLocaleDateString()})</h4>
                <div style="margin-top: 10px;">
                    <strong>Summary:</strong> ${report.summary.totalRuns} runs, ${report.summary.overallSuccessRate}% success rate
                </div>
                ${report.recommendations.length > 0 ? `
                    <div style="margin-top: 10px;">
                        <strong>Recommendations:</strong>
                        <ul style="margin-left: 20px;">
                            ${report.recommendations.slice(0, 3).map(rec => `<li>${rec.message}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}
            </div>
        `).join('');
    }

    /**
     * Calculate performance trend
     */
    calculateTrend(runs) {
        if (runs.length < 10) return 'stable';

        const midpoint = Math.floor(runs.length / 2);
        const firstHalf = runs.slice(0, midpoint);
        const secondHalf = runs.slice(midpoint);

        const firstAvg = firstHalf.reduce((sum, run) => sum + run.duration, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((sum, run) => sum + run.duration, 0) / secondHalf.length;

        const change = ((secondAvg - firstAvg) / firstAvg) * 100;

        if (change > 15) return 'down'; // Performance degrading (slower)
        if (change < -15) return 'up'; // Performance improving (faster)
        return 'stable';
    }

    /**
     * Format duration in human-readable format
     */
    formatDuration(ms) {
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return `${minutes}m ${seconds}s`;
    }
}

// CLI interface
if (require.main === module) {
    const dashboard = new PerformanceDashboard();
    const command = process.argv[2];

    switch (command) {
        case 'generate':
            dashboard.generateDashboard();
            break;

        default:
            console.log('Usage: node performance-dashboard.js <command>');
            console.log('Commands:');
            console.log('  generate    - Generate HTML performance dashboard');
            process.exit(1);
    }
}

module.exports = PerformanceDashboard;