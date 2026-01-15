#!/usr/bin/env node

/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-unused-vars */

/**
 * Telegram Notification Script for CI/CD Pipeline
 * Sends notifications about build status, test results, and deployment status
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

class TelegramNotifier {
    constructor(botToken, chatId) {
        this.botToken = botToken;
        this.chatId = chatId;
        this.apiUrl = `https://api.telegram.org/bot${botToken}`;
    }

    /**
     * Send a message to Telegram
     * @param {string} message - The message to send
     * @param {Object} options - Additional options
     */
    async sendMessage(message, options = {}) {
        const payload = {
            chat_id: this.chatId,
            text: message,
            parse_mode: 'Markdown',
            disable_web_page_preview: true,
            ...options
        };

        return new Promise((resolve, reject) => {
            const data = JSON.stringify(payload);

            const requestOptions = {
                hostname: 'api.telegram.org',
                port: 443,
                path: `/bot${this.botToken}/sendMessage`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': data.length
                }
            };

            const req = https.request(requestOptions, (res) => {
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

    /**
     * Format build failure notification
     */
    formatBuildFailure(context) {
        const { repository, branch, commit, actor, workflow, runId, failedJobs } = context;

        let message = ` *Build Failed*\n\n`;
        message += ` Repository: \`${repository}\`\n`;
        message += ` Branch: \`${branch}\`\n`;
        message += ` Author: ${actor}\n`;
        message += ` Workflow: ${workflow}\n`;
        message += ` Commit: \`${commit.substring(0, 8)}\`\n\n`;

        if (failedJobs && failedJobs.length > 0) {
            message += ` *Failed Jobs:*\n`;
            failedJobs.forEach(job => {
                message += `• ${job}\n`;
            });
            message += `\n`;
        }

        message += ` [View Details](https://github.com/${repository}/actions/runs/${runId})`;

        return message;
    }

    /**
     * Format build success notification
     */
    formatBuildSuccess(context) {
        const { repository, branch, commit, actor, workflow, runId, duration } = context;

        let message = ` *Build Successful*\n\n`;
        message += ` Repository: \`${repository}\`\n`;
        message += ` Branch: \`${branch}\`\n`;
        message += ` Author: ${actor}\n`;
        message += ` Workflow: ${workflow}\n`;
        message += ` Commit: \`${commit.substring(0, 8)}\`\n`;

        if (duration) {
            message += ` Duration: ${duration}\n`;
        }

        message += `\n [View Details](https://github.com/${repository}/actions/runs/${runId})`;

        return message;
    }

    /**
     * Format deployment notification
     */
    formatDeployment(context) {
        const { environment, status, version, repository, actor, deploymentUrl } = context;

        const statusEmoji = {
            'success': '',
            'failure': '',
            'in_progress': '',
            'rollback': '',
            'rollback_start': '',
            'rollback_success': '',
            'rollback_failure': ''
        };

        const statusText = {
            'success': 'Successful',
            'failure': 'Failed',
            'in_progress': 'In Progress',
            'rollback': 'Rolled Back',
            'rollback_start': 'Rollback Started',
            'rollback_success': 'Rollback Successful',
            'rollback_failure': 'Rollback Failed'
        };

        let message = `${statusEmoji[status]} *Deployment ${statusText[status]}*\n\n`;
        message += ` Environment: \`${environment}\`\n`;
        message += ` Repository: \`${repository}\`\n`;
        message += ` ${status.includes('rollback') ? 'Initiated by' : 'Deployed by'}: ${actor}\n`;

        if (version) {
            message += ` Version: \`${version}\`\n`;
        }

        if (deploymentUrl && (status === 'success' || status === 'rollback_success')) {
            message += `\n [View Application](${deploymentUrl})`;
        }

        // Add specific rollback information
        if (status.includes('rollback')) {
            message += `\n\n *Rollback Information:*\n`;
            if (status === 'rollback_start') {
                message += `• Rollback initiated due to deployment failure\n`;
                message += `• Target version: \`${version}\`\n`;
                message += `• Estimated time: 2-5 minutes`;
            } else if (status === 'rollback_success') {
                message += `• System restored to stable state\n`;
                message += `• All health checks passed\n`;
                message += `• Enhanced monitoring active for 30 minutes`;
            } else if (status === 'rollback_failure') {
                message += `•  Rollback operation failed\n`;
                message += `•  System may be in unstable state\n`;
                message += `•  Immediate manual intervention required`;
            }
        }

        return message;
    }

    /**
     * Format performance report notification
     */
    formatPerformanceReport(reportContent) {
        let message = ` *Weekly Performance Report*\n\n`;

        // Parse the report content to extract key metrics
        const lines = reportContent.split('\n');
        let inSummary = false;
        let inJobPerformance = false;

        for (const line of lines) {
            if (line.includes('Performance Summary:')) {
                inSummary = true;
                continue;
            }

            if (line.includes('Job Performance:')) {
                inJobPerformance = true;
                inSummary = false;
                message += `\n *Job Performance:*\n`;
                continue;
            }

            if (inSummary && line.trim()) {
                if (line.includes('Total Pipeline Runs:')) {
                    message += ` ${line.trim()}\n`;
                } else if (line.includes('Success Rate:')) {
                    message += ` ${line.trim()}\n`;
                } else if (line.includes('Average Duration:')) {
                    message += ` ${line.trim()}\n`;
                }
            }

            if (inJobPerformance && line.trim() && line.includes(':')) {
                message += `• ${line.trim()}\n`;
            }

            if (line.includes('WARNING:')) {
                message += `\n ${line.trim()}\n`;
            }
        }

        message += `\n *Actions Needed:*\n`;
        message += `• Review slow-running jobs\n`;
        message += `• Check for resource optimization opportunities\n`;
        message += `• Monitor trends for degradation\n`;

        message += `\n [View Detailed Report](https://github.com/${process.env.GITHUB_REPOSITORY}/actions)`;

        return message;
    }

    /**
     * Format performance alert notification
     */
    formatPerformanceAlert(alertData) {
        const { severity, job, message: alertMessage, type, value, threshold } = alertData;

        const severityEmoji = severity === 'critical' ? '' : '';
        const typeEmoji = {
            'performance': '',
            'resource': '',
            'reliability': ''
        };

        let message = `${severityEmoji} *Performance Alert*\n\n`;
        message += `${typeEmoji[type]} Type: ${type}\n`;
        message += ` Job: \`${job}\`\n`;
        message += ` Severity: ${severity}\n`;
        message += ` Message: ${alertMessage}\n`;

        if (value && threshold) {
            message += ` Value: ${value} (threshold: ${threshold})\n`;
        }

        message += `\n [View Pipeline](https://github.com/${process.env.GITHUB_REPOSITORY}/actions)`;

        return message;
    }
    /**
     * Format coverage report notification
     */
    formatCoverage(context) {
        const { repository, branch, coverage, threshold, trend } = context;

        const coverageEmoji = coverage >= threshold ? '' : '';
        const trendEmoji = {
            'up': '',
            'down': '',
            'stable': ''
        };

        let message = `${coverageEmoji} *Code Coverage Report*\n\n`;
        message += ` Repository: \`${repository}\`\n`;
        message += ` Branch: \`${branch}\`\n`;
        message += ` Coverage: ${coverage}% (threshold: ${threshold}%)\n`;

        if (trend) {
            message += ` Trend: ${trendEmoji[trend.direction]} ${trend.change}%\n`;
        }

        if (coverage < threshold) {
            message += `\n Coverage below threshold! Please add more tests.`;
        }

        return message;
    }

    /**
     * Format security alert notification
     */
    formatSecurityAlert(context) {
        const { severity, criticalCount, highCount, repository, commit, runId } = context;

        const severityEmoji = severity === 'critical' ? '' : '';
        const severityText = severity === 'critical' ? 'CRITICAL' : 'HIGH';

        let message = `${severityEmoji} *SECURITY ALERT* ${severityEmoji}\n\n`;
        message += ` Severity: *${severityText}*\n`;
        message += ` Repository: \`${repository}\`\n`;
        message += ` Commit: \`${commit?.substring(0, 7)}\`\n\n`;

        message += ` *Issues Found:*\n`;
        message += `• Critical: ${criticalCount}\n`;
        message += `• High: ${highCount}\n\n`;

        if (severity === 'critical') {
            message += `� *DEPLOYMENT BLOCKED*\n\n`;
            message += ` *Immediate Action Required:*\n`;
            message += `1. Stop all deployments\n`;
            message += `2. Review security scan results\n`;
            message += `3. Fix critical vulnerabilities\n`;
            message += `4. Re-run security scan\n`;
        } else {
            message += ` *REVIEW REQUIRED*\n\n`;
            message += ` *Recommended Actions:*\n`;
            message += `1. Review security issues\n`;
            message += `2. Plan remediation\n`;
            message += `3. Monitor for updates\n`;
        }

        message += `\n *Links:*\n`;
        message += `• [Security Scan Results](https://github.com/${repository}/actions/runs/${runId})\n`;
        message += `• [Security Guide](https://github.com/${repository}/blob/main/docs/Security_Guide.md)`;

        return message;
    }

    /**
     * Format secrets audit notification
     */
    formatSecretsAudit(context) {
        const { auditMessage, repository, runId } = context;

        let message = ` *SECRETS AUDIT*\n\n`;
        message += ` Status: ${auditMessage}\n`;
        message += ` Repository: \`${repository}\`\n`;
        message += ` Date: ${new Date().toISOString().split('T')[0]}\n\n`;

        message += ` *Next Steps:*\n`;
        message += `• Review audit results\n`;
        message += `• Check rotation schedule\n`;
        message += `• Update secrets if needed\n\n`;

        message += ` *Links:*\n`;
        message += `• [Audit Results](https://github.com/${repository}/actions/runs/${runId})\n`;
        message += `• [Secrets Management](https://github.com/${repository}/settings/secrets/actions)`;

        return message;
    }
}

/**
 * Main function to handle different notification types
 */
async function main() {
    const args = process.argv.slice(2);
    const notificationType = args[0];

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
        console.error('Error: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID environment variables are required');
        process.exit(1);
    }

    const notifier = new TelegramNotifier(botToken, chatId);

    try {
        let message = '';

        switch (notificationType) {
            case 'build-failure':
                const failureContext = {
                    repository: process.env.GITHUB_REPOSITORY,
                    branch: process.env.GITHUB_REF_NAME,
                    commit: process.env.GITHUB_SHA,
                    actor: process.env.GITHUB_ACTOR,
                    workflow: process.env.GITHUB_WORKFLOW,
                    runId: process.env.GITHUB_RUN_ID,
                    failedJobs: args.slice(1)
                };
                message = notifier.formatBuildFailure(failureContext);
                break;

            case 'build-success':
                const successContext = {
                    repository: process.env.GITHUB_REPOSITORY,
                    branch: process.env.GITHUB_REF_NAME,
                    commit: process.env.GITHUB_SHA,
                    actor: process.env.GITHUB_ACTOR,
                    workflow: process.env.GITHUB_WORKFLOW,
                    runId: process.env.GITHUB_RUN_ID,
                    duration: args[1]
                };
                message = notifier.formatBuildSuccess(successContext);
                break;

            case 'deployment':
                const deploymentContext = {
                    environment: args[1],
                    status: args[2],
                    version: args[3],
                    repository: process.env.GITHUB_REPOSITORY,
                    actor: process.env.GITHUB_ACTOR,
                    deploymentUrl: args[4]
                };
                message = notifier.formatDeployment(deploymentContext);
                break;

            case 'performance-report':
                const reportContent = args[1];
                message = notifier.formatPerformanceReport(reportContent);
                break;

            case 'performance-alert':
                const alertData = JSON.parse(args[1]);
                message = notifier.formatPerformanceAlert(alertData);
                break;

            case 'coverage':
                const coverageContext = {
                    repository: process.env.GITHUB_REPOSITORY,
                    branch: process.env.GITHUB_REF_NAME,
                    coverage: parseFloat(args[1]),
                    threshold: parseFloat(args[2]),
                    trend: args[3] ? JSON.parse(args[3]) : null
                };
                message = notifier.formatCoverage(coverageContext);
                break;

            case 'security-alert':
                const securityContext = {
                    severity: args[1] || 'unknown',
                    criticalCount: args[2] || '0',
                    highCount: args[3] || '0',
                    repository: process.env.GITHUB_REPOSITORY,
                    commit: process.env.GITHUB_SHA,
                    runId: process.env.GITHUB_RUN_ID
                };
                message = notifier.formatSecurityAlert(securityContext);
                break;

            case 'secrets-audit':
                const auditContext = {
                    auditMessage: args[1] || 'Secrets audit completed',
                    repository: process.env.GITHUB_REPOSITORY,
                    runId: process.env.GITHUB_RUN_ID
                };
                message = notifier.formatSecretsAudit(auditContext);
                break;

            default:
                console.error(`Unknown notification type: ${notificationType}`);
                console.error('Usage: node telegram-notify.js <type> [args...]');
                console.error('Types: build-failure, build-success, deployment, coverage, performance-report, performance-alert, security-alert, secrets-audit');
                process.exit(1);
        }

        await notifier.sendMessage(message);
        console.log('Telegram notification sent successfully');

    } catch (error) {
        console.error('Failed to send Telegram notification:', error.message);
        // Don't fail the CI pipeline if notification fails
        process.exit(0);
    }
}

if (require.main === module) {
    main();
}

module.exports = { TelegramNotifier };
