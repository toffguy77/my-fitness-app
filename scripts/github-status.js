#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * GitHub Status and PR Comment Script for CI/CD Pipeline
 * Updates commit statuses and creates detailed PR comments
 */

const https = require('https');
const fs = require('fs');
// const path = require('path'); // Commented out unused import

class GitHubStatusManager {
    constructor(token, repository) {
        this.token = token;
        this.repository = repository;
        this.apiUrl = 'api.github.com';
    }

    /**
     * Make a GitHub API request
     */
    async makeRequest(method, endpoint, data = null) {
        return new Promise((resolve, reject) => {
            const requestData = data ? JSON.stringify(data) : null;

            const options = {
                hostname: this.apiUrl,
                port: 443,
                path: endpoint,
                method: method,
                headers: {
                    'Authorization': `token ${this.token}`,
                    'User-Agent': 'CI-CD-Pipeline',
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                }
            };

            if (requestData) {
                options.headers['Content-Length'] = Buffer.byteLength(requestData);
            }

            const req = https.request(options, (res) => {
                let responseData = '';

                res.on('data', (chunk) => {
                    responseData += chunk;
                });

                res.on('end', () => {
                    try {
                        const response = responseData ? JSON.parse(responseData) : {};
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            resolve(response);
                        } else {
                            reject(new Error(`GitHub API error: ${res.statusCode} - ${response.message || responseData}`));
                        }
                    } catch (error) {
                        reject(new Error(`Failed to parse GitHub response: ${error.message}`));
                    }
                });
            });

            req.on('error', (error) => {
                reject(new Error(`Request failed: ${error.message}`));
            });

            if (requestData) {
                req.write(requestData);
            }
            req.end();
        });
    }

    /**
     * Update commit status
     */
    async updateCommitStatus(sha, context, state, description, targetUrl = null) {
        const endpoint = `/repos/${this.repository}/statuses/${sha}`;

        const statusData = {
            state: state, // pending, success, error, failure
            description: description,
            context: context
        };

        if (targetUrl) {
            statusData.target_url = targetUrl;
        }

        return await this.makeRequest('POST', endpoint, statusData);
    }

    /**
     * Create or update PR comment
     */
    async createOrUpdatePRComment(prNumber, commentBody, commentId = null) {
        let endpoint, method;

        if (commentId) {
            endpoint = `/repos/${this.repository}/issues/comments/${commentId}`;
            method = 'PATCH';
        } else {
            endpoint = `/repos/${this.repository}/issues/${prNumber}/comments`;
            method = 'POST';
        }

        const commentData = {
            body: commentBody
        };

        return await this.makeRequest(method, endpoint, commentData);
    }

    /**
     * Find existing bot comment in PR
     */
    async findBotComment(prNumber, commentPrefix) {
        const endpoint = `/repos/${this.repository}/issues/${prNumber}/comments`;

        try {
            const comments = await this.makeRequest('GET', endpoint);

            return comments.find(comment =>
                comment.user.login === 'github-actions[bot]' &&
                comment.body.includes(commentPrefix)
            );
        } catch (error) {
            console.warn('Could not fetch existing comments:', error.message);
            return null;
        }
    }

    /**
     * Format comprehensive PR comment
     */
    formatPRComment(context) {
        const {
            workflow,
            runId,
            sha,
            qualityChecks,
            testResults,
            coverage,
            securityScan,
            performance,
            artifacts
        } = context;

        let comment = `## 🔍 CI/CD Pipeline Report\n\n`;
        comment += `**Workflow:** ${workflow}\n`;
        comment += `**Commit:** \`${sha.substring(0, 8)}\`\n`;
        comment += `**Run ID:** [${runId}](https://github.com/${this.repository}/actions/runs/${runId})\n\n`;

        // Quality Checks Section
        comment += `### 📋 Code Quality Checks\n\n`;
        comment += `| Check | Status | Details |\n`;
        comment += `|-------|--------|----------|\n`;

        if (qualityChecks.eslint) {
            const status = qualityChecks.eslint.passed ? '✅' : '❌';
            comment += `| ESLint | ${status} | ${qualityChecks.eslint.details} |\n`;
        }

        if (qualityChecks.typescript) {
            const status = qualityChecks.typescript.passed ? '✅' : '❌';
            comment += `| TypeScript | ${status} | ${qualityChecks.typescript.details} |\n`;
        }

        if (qualityChecks.security) {
            const status = qualityChecks.security.passed ? '✅' : '❌';
            comment += `| Security Scan | ${status} | ${qualityChecks.security.details} |\n`;
        }

        // Test Results Section
        if (testResults) {
            comment += `\n### 🧪 Test Results\n\n`;
            comment += `| Test Suite | Status | Passed | Failed | Duration |\n`;
            comment += `|------------|--------|--------|--------|-----------|\n`;

            Object.entries(testResults).forEach(([suite, result]) => {
                const status = result.failed === 0 ? '✅' : '❌';
                comment += `| ${suite} | ${status} | ${result.passed} | ${result.failed} | ${result.duration} |\n`;
            });
        }

        // Coverage Section
        if (coverage) {
            comment += `\n### 📊 Code Coverage\n\n`;
            comment += `| Metric | Coverage | Threshold | Status |\n`;
            comment += `|--------|----------|-----------|--------|\n`;

            const metrics = ['statements', 'branches', 'functions', 'lines'];
            metrics.forEach(metric => {
                if (coverage[metric]) {
                    const status = coverage[metric].pct >= coverage.threshold ? '✅' : '❌';
                    comment += `| ${metric.charAt(0).toUpperCase() + metric.slice(1)} | ${coverage[metric].pct}% | ${coverage.threshold}% | ${status} |\n`;
                }
            });

            comment += `\n**Overall Coverage:** ${coverage.overall}%\n`;

            if (coverage.trend) {
                const trendEmoji = coverage.trend > 0 ? '📈' : coverage.trend < 0 ? '📉' : '➡️';
                comment += `**Trend:** ${trendEmoji} ${coverage.trend > 0 ? '+' : ''}${coverage.trend}%\n`;
            }
        }

        // Security Scan Details
        if (securityScan && securityScan.vulnerabilities) {
            comment += `\n### 🔒 Security Scan\n\n`;

            const { critical, high, moderate, low } = securityScan.vulnerabilities;

            if (critical > 0 || high > 0) {
                comment += `⚠️ **Security Issues Found:**\n`;
                if (critical > 0) comment += `- 🚨 Critical: ${critical}\n`;
                if (high > 0) comment += `- ⚠️ High: ${high}\n`;
                if (moderate > 0) comment += `- 📋 Moderate: ${moderate}\n`;
                if (low > 0) comment += `- ℹ️ Low: ${low}\n`;
            } else {
                comment += `✅ No critical or high severity vulnerabilities found\n`;
            }
        }

        // Performance Metrics
        if (performance) {
            comment += `\n### ⚡ Performance Metrics\n\n`;
            comment += `- **Pipeline Duration:** ${performance.duration}\n`;
            comment += `- **Build Time:** ${performance.buildTime}\n`;
            comment += `- **Test Execution:** ${performance.testTime}\n`;
        }

        // Artifacts
        if (artifacts && artifacts.length > 0) {
            comment += `\n### 📦 Build Artifacts\n\n`;
            artifacts.forEach(artifact => {
                comment += `- [${artifact.name}](${artifact.url}) (${artifact.size})\n`;
            });
        }

        // Footer
        comment += `\n---\n`;
        comment += `*This comment is automatically updated by the CI/CD pipeline*\n`;
        comment += `*Last updated: ${new Date().toISOString()}*`;

        return comment;
    }

    /**
     * Format simple status comment
     */
    formatStatusComment(status, details) {
        const statusEmoji = {
            'success': '✅',
            'failure': '❌',
            'pending': '⏳',
            'error': '💥'
        };

        let comment = `## ${statusEmoji[status]} Pipeline Status: ${status.toUpperCase()}\n\n`;

        if (details) {
            comment += `**Details:** ${details}\n\n`;
        }

        comment += `**Commit:** \`${process.env.GITHUB_SHA?.substring(0, 8) || 'unknown'}\`\n`;
        comment += `**Workflow:** ${process.env.GITHUB_WORKFLOW || 'CI Pipeline'}\n`;
        comment += `**Run:** [View Details](https://github.com/${this.repository}/actions/runs/${process.env.GITHUB_RUN_ID})\n\n`;

        comment += `---\n*Updated: ${new Date().toISOString()}*`;

        return comment;
    }
}

/**
 * Main function
 */
async function main() {
    const args = process.argv.slice(2);
    const action = args[0];

    const token = process.env.GITHUB_TOKEN;
    const repository = process.env.GITHUB_REPOSITORY;

    if (!token || !repository) {
        console.error('Error: GITHUB_TOKEN and GITHUB_REPOSITORY environment variables are required');
        process.exit(1);
    }

    const statusManager = new GitHubStatusManager(token, repository);

    try {
        switch (action) {
            case 'update-status':
                const [sha, context, state, description, targetUrl] = args.slice(1);
                await statusManager.updateCommitStatus(sha, context, state, description, targetUrl);
                console.log(`Updated commit status: ${context} -> ${state}`);
                break;

            case 'comment-pr':
                const prNumber = args[1];
                const commentType = args[2];

                if (commentType === 'comprehensive') {
                    // Read context from file or environment
                    const contextFile = args[3] || 'pipeline-context.json';
                    let context = {};

                    try {
                        if (fs.existsSync(contextFile)) {
                            context = JSON.parse(fs.readFileSync(contextFile, 'utf8'));
                        }
                    } catch {
                        console.warn('Could not read context file, using minimal context');
                    }

                    const comment = statusManager.formatPRComment(context);
                    const existingComment = await statusManager.findBotComment(prNumber, '🔍 CI/CD Pipeline Report');

                    if (existingComment) {
                        await statusManager.createOrUpdatePRComment(prNumber, comment, existingComment.id);
                        console.log('Updated existing PR comment');
                    } else {
                        await statusManager.createOrUpdatePRComment(prNumber, comment);
                        console.log('Created new PR comment');
                    }
                } else {
                    // Simple status comment
                    const status = args[3];
                    const details = args[4];
                    const comment = statusManager.formatStatusComment(status, details);

                    await statusManager.createOrUpdatePRComment(prNumber, comment);
                    console.log('Created status comment');
                }
                break;

            default:
                console.error(`Unknown action: ${action}`);
                console.error('Usage: node github-status.js <action> [args...]');
                console.error('Actions: update-status, comment-pr');
                process.exit(1);
        }

    } catch (error) {
        console.error('GitHub status operation failed:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { GitHubStatusManager };
