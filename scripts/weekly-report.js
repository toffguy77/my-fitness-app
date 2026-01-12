#!/usr/bin/env node

/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-unused-vars */

/**
 * Weekly CI/CD Pipeline Report Generator
 * Generates comprehensive reports about pipeline performance, quality metrics, and trends
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

class WeeklyReportGenerator {
    constructor(githubToken, repository, telegramToken = null, telegramChatId = null) {
        this.githubToken = githubToken;
        this.repository = repository;
        this.telegramToken = telegramToken;
        this.telegramChatId = telegramChatId;
        this.apiUrl = 'api.github.com';
    }

    /**
     * Make a GitHub API request
     */
    async makeGitHubRequest(endpoint) {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: this.apiUrl,
                port: 443,
                path: endpoint,
                method: 'GET',
                headers: {
                    'Authorization': `token ${this.githubToken}`,
                    'User-Agent': 'Weekly-Report-Generator',
                    'Accept': 'application/vnd.github.v3+json'
                }
            };

            const req = https.request(options, (res) => {
                let responseData = '';

                res.on('data', (chunk) => {
                    responseData += chunk;
                });

                res.on('end', () => {
                    try {
                        const response = JSON.parse(responseData);
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            resolve(response);
                        } else {
                            reject(new Error(`GitHub API error: ${res.statusCode} - ${response.message}`));
                        }
                    } catch (error) {
                        reject(new Error(`Failed to parse GitHub response: ${error.message}`));
                    }
                });
            });

            req.on('error', (error) => {
                reject(new Error(`Request failed: ${error.message}`));
            });

            req.end();
        });
    }

    /**
     * Get workflow runs for the past week
     */
    async getWeeklyWorkflowRuns() {
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

        const endpoint = `/repos/${this.repository}/actions/runs?created=>=${oneWeekAgo.toISOString()}&per_page=100`;

        try {
            const response = await this.makeGitHubRequest(endpoint);
            return response.workflow_runs || [];
        } catch (error) {
            console.warn('Could not fetch workflow runs:', error.message);
            return [];
        }
    }

    /**
     * Get pull requests for the past week
     */
    async getWeeklyPullRequests() {
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

        const endpoint = `/repos/${this.repository}/pulls?state=all&sort=updated&direction=desc&per_page=100`;

        try {
            const response = await this.makeGitHubRequest(endpoint);

            // Filter PRs updated in the last week
            return response.filter(pr => {
                const updatedAt = new Date(pr.updated_at);
                return updatedAt >= oneWeekAgo;
            });
        } catch (error) {
            console.warn('Could not fetch pull requests:', error.message);
            return [];
        }
    }

    /**
     * Analyze workflow performance
     */
    analyzeWorkflowPerformance(workflowRuns) {
        const analysis = {
            totalRuns: workflowRuns.length,
            successfulRuns: 0,
            failedRuns: 0,
            cancelledRuns: 0,
            averageDuration: 0,
            longestRun: 0,
            shortestRun: Infinity,
            workflowBreakdown: {},
            dailyBreakdown: {}
        };

        let totalDuration = 0;
        const durations = [];

        workflowRuns.forEach(run => {
            // Count by status
            switch (run.status) {
                case 'completed':
                    if (run.conclusion === 'success') {
                        analysis.successfulRuns++;
                    } else {
                        analysis.failedRuns++;
                    }
                    break;
                case 'cancelled':
                    analysis.cancelledRuns++;
                    break;
            }

            // Calculate duration
            if (run.created_at && run.updated_at) {
                const duration = new Date(run.updated_at) - new Date(run.created_at);
                durations.push(duration);
                totalDuration += duration;

                analysis.longestRun = Math.max(analysis.longestRun, duration);
                analysis.shortestRun = Math.min(analysis.shortestRun, duration);
            }

            // Workflow breakdown
            const workflowName = run.name || 'Unknown';
            if (!analysis.workflowBreakdown[workflowName]) {
                analysis.workflowBreakdown[workflowName] = {
                    total: 0,
                    successful: 0,
                    failed: 0
                };
            }
            analysis.workflowBreakdown[workflowName].total++;
            if (run.conclusion === 'success') {
                analysis.workflowBreakdown[workflowName].successful++;
            } else if (run.conclusion === 'failure') {
                analysis.workflowBreakdown[workflowName].failed++;
            }

            // Daily breakdown
            const date = new Date(run.created_at).toISOString().split('T')[0];
            if (!analysis.dailyBreakdown[date]) {
                analysis.dailyBreakdown[date] = { total: 0, successful: 0, failed: 0 };
            }
            analysis.dailyBreakdown[date].total++;
            if (run.conclusion === 'success') {
                analysis.dailyBreakdown[date].successful++;
            } else if (run.conclusion === 'failure') {
                analysis.dailyBreakdown[date].failed++;
            }
        });

        // Calculate averages
        if (durations.length > 0) {
            analysis.averageDuration = totalDuration / durations.length;
        }

        if (analysis.shortestRun === Infinity) {
            analysis.shortestRun = 0;
        }

        return analysis;
    }

    /**
     * Analyze pull request metrics
     */
    analyzePullRequestMetrics(pullRequests) {
        const analysis = {
            totalPRs: pullRequests.length,
            openPRs: 0,
            mergedPRs: 0,
            closedPRs: 0,
            averageTimeToMerge: 0,
            averageReviewTime: 0,
            authorBreakdown: {},
            sizeBreakdown: { small: 0, medium: 0, large: 0 }
        };

        let totalMergeTime = 0;
        let mergedCount = 0;

        pullRequests.forEach(pr => {
            // Count by state
            if (pr.state === 'open') {
                analysis.openPRs++;
            } else if (pr.merged_at) {
                analysis.mergedPRs++;

                // Calculate time to merge
                const createdAt = new Date(pr.created_at);
                const mergedAt = new Date(pr.merged_at);
                const mergeTime = mergedAt - createdAt;
                totalMergeTime += mergeTime;
                mergedCount++;
            } else {
                analysis.closedPRs++;
            }

            // Author breakdown
            const author = pr.user.login;
            if (!analysis.authorBreakdown[author]) {
                analysis.authorBreakdown[author] = { total: 0, merged: 0 };
            }
            analysis.authorBreakdown[author].total++;
            if (pr.merged_at) {
                analysis.authorBreakdown[author].merged++;
            }

            // Size breakdown (based on changes)
            const additions = pr.additions || 0;
            const deletions = pr.deletions || 0;
            const totalChanges = additions + deletions;

            if (totalChanges < 50) {
                analysis.sizeBreakdown.small++;
            } else if (totalChanges < 200) {
                analysis.sizeBreakdown.medium++;
            } else {
                analysis.sizeBreakdown.large++;
            }
        });

        // Calculate averages
        if (mergedCount > 0) {
            analysis.averageTimeToMerge = totalMergeTime / mergedCount;
        }

        return analysis;
    }

    /**
     * Format duration in human-readable format
     */
    formatDuration(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }

    /**
     * Generate comprehensive weekly report
     */
    async generateWeeklyReport() {
        console.log(' Generating weekly CI/CD report...');

        const [workflowRuns, pullRequests] = await Promise.all([
            this.getWeeklyWorkflowRuns(),
            this.getWeeklyPullRequests()
        ]);

        const workflowAnalysis = this.analyzeWorkflowPerformance(workflowRuns);
        const prAnalysis = this.analyzePullRequestMetrics(pullRequests);

        const report = this.formatReport(workflowAnalysis, prAnalysis);

        return {
            report,
            workflowAnalysis,
            prAnalysis,
            rawData: {
                workflowRuns,
                pullRequests
            }
        };
    }

    /**
     * Format the report as markdown
     */
    formatReport(workflowAnalysis, prAnalysis) {
        const now = new Date();
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - 7);

        let report = `#  Weekly CI/CD Report\n\n`;
        report += `**Period:** ${weekStart.toDateString()} - ${now.toDateString()}\n`;
        report += `**Repository:** ${this.repository}\n`;
        report += `**Generated:** ${now.toISOString()}\n\n`;

        // Executive Summary
        report += `##  Executive Summary\n\n`;

        const successRate = workflowAnalysis.totalRuns > 0
            ? ((workflowAnalysis.successfulRuns / workflowAnalysis.totalRuns) * 100).toFixed(1)
            : 0;

        const mergeRate = prAnalysis.totalPRs > 0
            ? ((prAnalysis.mergedPRs / prAnalysis.totalPRs) * 100).toFixed(1)
            : 0;

        report += `- **Pipeline Success Rate:** ${successRate}% (${workflowAnalysis.successfulRuns}/${workflowAnalysis.totalRuns})\n`;
        report += `- **Average Build Time:** ${this.formatDuration(workflowAnalysis.averageDuration)}\n`;
        report += `- **Pull Requests:** ${prAnalysis.totalPRs} total, ${prAnalysis.mergedPRs} merged (${mergeRate}%)\n`;
        report += `- **Average Time to Merge:** ${this.formatDuration(prAnalysis.averageTimeToMerge)}\n\n`;

        // Pipeline Performance
        report += `##  Pipeline Performance\n\n`;
        report += `### Workflow Statistics\n\n`;
        report += `| Metric | Value |\n`;
        report += `|--------|-------|\n`;
        report += `| Total Runs | ${workflowAnalysis.totalRuns} |\n`;
        report += `| Successful | ${workflowAnalysis.successfulRuns} (${successRate}%) |\n`;
        report += `| Failed | ${workflowAnalysis.failedRuns} |\n`;
        report += `| Cancelled | ${workflowAnalysis.cancelledRuns} |\n`;
        report += `| Average Duration | ${this.formatDuration(workflowAnalysis.averageDuration)} |\n`;
        report += `| Longest Run | ${this.formatDuration(workflowAnalysis.longestRun)} |\n`;
        report += `| Shortest Run | ${this.formatDuration(workflowAnalysis.shortestRun)} |\n\n`;

        // Workflow Breakdown
        if (Object.keys(workflowAnalysis.workflowBreakdown).length > 0) {
            report += `### Workflow Breakdown\n\n`;
            report += `| Workflow | Total | Successful | Failed | Success Rate |\n`;
            report += `|----------|-------|------------|--------|--------------|\n`;

            Object.entries(workflowAnalysis.workflowBreakdown).forEach(([name, stats]) => {
                const rate = stats.total > 0 ? ((stats.successful / stats.total) * 100).toFixed(1) : 0;
                report += `| ${name} | ${stats.total} | ${stats.successful} | ${stats.failed} | ${rate}% |\n`;
            });
            report += `\n`;
        }

        // Daily Activity
        if (Object.keys(workflowAnalysis.dailyBreakdown).length > 0) {
            report += `### Daily Activity\n\n`;
            report += `| Date | Total Runs | Successful | Failed |\n`;
            report += `|------|------------|------------|---------|\n`;

            Object.entries(workflowAnalysis.dailyBreakdown)
                .sort(([a], [b]) => a.localeCompare(b))
                .forEach(([date, stats]) => {
                    report += `| ${date} | ${stats.total} | ${stats.successful} | ${stats.failed} |\n`;
                });
            report += `\n`;
        }

        // Pull Request Metrics
        report += `## � Pull Request Metrics\n\n`;
        report += `### PR Statistics\n\n`;
        report += `| Metric | Value |\n`;
        report += `|--------|-------|\n`;
        report += `| Total PRs | ${prAnalysis.totalPRs} |\n`;
        report += `| Open | ${prAnalysis.openPRs} |\n`;
        report += `| Merged | ${prAnalysis.mergedPRs} (${mergeRate}%) |\n`;
        report += `| Closed (not merged) | ${prAnalysis.closedPRs} |\n`;
        report += `| Average Time to Merge | ${this.formatDuration(prAnalysis.averageTimeToMerge)} |\n\n`;

        // PR Size Distribution
        report += `### PR Size Distribution\n\n`;
        report += `| Size | Count | Percentage |\n`;
        report += `|------|-------|------------|\n`;
        const total = prAnalysis.sizeBreakdown.small + prAnalysis.sizeBreakdown.medium + prAnalysis.sizeBreakdown.large;
        if (total > 0) {
            report += `| Small (<50 changes) | ${prAnalysis.sizeBreakdown.small} | ${((prAnalysis.sizeBreakdown.small / total) * 100).toFixed(1)}% |\n`;
            report += `| Medium (50-200 changes) | ${prAnalysis.sizeBreakdown.medium} | ${((prAnalysis.sizeBreakdown.medium / total) * 100).toFixed(1)}% |\n`;
            report += `| Large (>200 changes) | ${prAnalysis.sizeBreakdown.large} | ${((prAnalysis.sizeBreakdown.large / total) * 100).toFixed(1)}% |\n`;
        }
        report += `\n`;

        // Top Contributors
        if (Object.keys(prAnalysis.authorBreakdown).length > 0) {
            report += `### Top Contributors\n\n`;
            report += `| Author | PRs | Merged | Merge Rate |\n`;
            report += `|--------|-----|--------|-----------|\n`;

            Object.entries(prAnalysis.authorBreakdown)
                .sort(([, a], [, b]) => b.total - a.total)
                .slice(0, 10)
                .forEach(([author, stats]) => {
                    const rate = stats.total > 0 ? ((stats.merged / stats.total) * 100).toFixed(1) : 0;
                    report += `| ${author} | ${stats.total} | ${stats.merged} | ${rate}% |\n`;
                });
            report += `\n`;
        }

        // Recommendations
        report += `## � Recommendations\n\n`;

        if (successRate < 90) {
            report += `-  **Pipeline Success Rate** is below 90%. Consider investigating frequent failure causes.\n`;
        }

        if (workflowAnalysis.averageDuration > 15 * 60 * 1000) { // 15 minutes
            report += `-  **Average build time** is over 15 minutes. Consider optimizing pipeline performance.\n`;
        }

        if (prAnalysis.averageTimeToMerge > 3 * 24 * 60 * 60 * 1000) { // 3 days
            report += `-  **Average time to merge** is over 3 days. Consider streamlining review process.\n`;
        }

        if (prAnalysis.sizeBreakdown.large / total > 0.3) { // More than 30% large PRs
            report += `-  **Large PRs** make up more than 30% of submissions. Consider encouraging smaller, more focused changes.\n`;
        }

        if (successRate >= 95 && workflowAnalysis.averageDuration < 10 * 60 * 1000) {
            report += `-  **Excellent pipeline performance!** Keep up the good work.\n`;
        }

        report += `\n---\n`;
        report += `*Report generated automatically by CI/CD Pipeline*\n`;

        return report;
    }

    /**
     * Send report via Telegram
     */
    async sendTelegramReport(report) {
        if (!this.telegramToken || !this.telegramChatId) {
            console.log('Telegram credentials not provided, skipping Telegram notification');
            return;
        }

        // Truncate report for Telegram (max 4096 characters)
        let telegramReport = report;
        if (report.length > 4000) {
            telegramReport = report.substring(0, 3900) + '\n\n... (truncated)\n\n*Full report available in repository*';
        }

        const payload = {
            chat_id: this.telegramChatId,
            text: telegramReport,
            parse_mode: 'Markdown',
            disable_web_page_preview: true
        };

        return new Promise((resolve, reject) => {
            const data = JSON.stringify(payload);

            const options = {
                hostname: 'api.telegram.org',
                port: 443,
                path: `/bot${this.telegramToken}/sendMessage`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': data.length
                }
            };

            const req = https.request(options, (res) => {
                let responseData = '';

                res.on('data', (chunk) => {
                    responseData += chunk;
                });

                res.on('end', () => {
                    try {
                        const response = JSON.parse(responseData);
                        if (response.ok) {
                            resolve(response);
                        } else {
                            reject(new Error(`Telegram API error: ${response.description}`));
                        }
                    } catch (error) {
                        reject(new Error(`Failed to parse Telegram response: ${error.message}`));
                    }
                });
            });

            req.on('error', (error) => {
                reject(new Error(`Request failed: ${error.message}`));
            });

            req.write(data);
            req.end();
        });
    }
}

/**
 * Main function
 */
async function main() {
    const githubToken = process.env.GITHUB_TOKEN;
    const repository = process.env.GITHUB_REPOSITORY;
    const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
    const telegramChatId = process.env.TELEGRAM_CHAT_ID;

    if (!githubToken || !repository) {
        console.error('Error: GITHUB_TOKEN and GITHUB_REPOSITORY environment variables are required');
        process.exit(1);
    }

    const generator = new WeeklyReportGenerator(githubToken, repository, telegramToken, telegramChatId);

    try {
        const { report, workflowAnalysis, prAnalysis } = await generator.generateWeeklyReport();

        // Save report to file
        const reportDir = 'reports';
        if (!fs.existsSync(reportDir)) {
            fs.mkdirSync(reportDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().split('T')[0];
        const reportFile = path.join(reportDir, `weekly-report-${timestamp}.md`);

        fs.writeFileSync(reportFile, report);
        console.log(` Report saved to: ${reportFile}`);

        // Save JSON data for further analysis
        const dataFile = path.join(reportDir, `weekly-data-${timestamp}.json`);
        fs.writeFileSync(dataFile, JSON.stringify({
            workflowAnalysis,
            prAnalysis,
            generatedAt: new Date().toISOString()
        }, null, 2));

        console.log(` Data saved to: ${dataFile}`);

        // Send via Telegram if configured
        if (telegramToken && telegramChatId) {
            await generator.sendTelegramReport(report);
            console.log(' Report sent via Telegram');
        }

        console.log(' Weekly report generation completed');

    } catch (error) {
        console.error(' Failed to generate weekly report:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { WeeklyReportGenerator };