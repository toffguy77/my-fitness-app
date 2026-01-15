#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */


/**
 * Rollback Utilities for CI/CD Pipeline
 * Provides utilities for managing deployment rollbacks
 */

const fs = require('fs');
const path = require('path');

class RollbackManager {
    constructor() {
        this.deploymentHistoryFile = path.join(__dirname, '..', '.deployment-history.json');
    }

    /**
     * Record a successful deployment
     * @param {Object} deployment - Deployment details
     */
    recordDeployment(deployment) {
        const history = this.getDeploymentHistory();

        const record = {
            id: `deploy-${Date.now()}`,
            timestamp: new Date().toISOString(),
            environment: deployment.environment,
            version: deployment.version,
            commit: deployment.commit,
            actor: deployment.actor,
            workflow_run_id: deployment.workflow_run_id,
            deployment_url: deployment.deployment_url,
            status: 'success'
        };

        history.deployments.unshift(record);

        // Keep only last 50 deployments per environment
        const envDeployments = history.deployments.filter(d => d.environment === deployment.environment);
        if (envDeployments.length > 50) {
            history.deployments = history.deployments.filter(d =>
                d.environment !== deployment.environment ||
                envDeployments.slice(0, 50).includes(d)
            );
        }

        this.saveDeploymentHistory(history);
        return record;
    }

    /**
     * Get deployment history
     */
    getDeploymentHistory() {
        try {
            if (fs.existsSync(this.deploymentHistoryFile)) {
                return JSON.parse(fs.readFileSync(this.deploymentHistoryFile, 'utf8'));
            }
        } catch (error) {
            console.warn('Could not read deployment history:', error.message);
        }

        return {
            deployments: [],
            rollbacks: []
        };
    }

    /**
     * Save deployment history
     */
    saveDeploymentHistory(history) {
        try {
            fs.writeFileSync(this.deploymentHistoryFile, JSON.stringify(history, null, 2));
        } catch (error) {
            console.error('Could not save deployment history:', error.message);
        }
    }

    /**
     * Get the last successful deployment for an environment
     * @param {string} environment - Environment name
     * @param {string} excludeVersion - Version to exclude (current failed version)
     */
    getLastSuccessfulDeployment(environment, excludeVersion = null) {
        const history = this.getDeploymentHistory();

        const successfulDeployments = history.deployments.filter(d =>
            d.environment === environment &&
            d.status === 'success' &&
            (!excludeVersion || d.version !== excludeVersion)
        );

        return successfulDeployments[0] || null;
    }

    /**
     * Record a rollback operation
     * @param {Object} rollback - Rollback details
     */
    recordRollback(rollback) {
        const history = this.getDeploymentHistory();

        const record = {
            id: `rollback-${Date.now()}`,
            timestamp: new Date().toISOString(),
            environment: rollback.environment,
            from_version: rollback.from_version,
            to_version: rollback.to_version,
            reason: rollback.reason,
            type: rollback.type, // 'automatic' or 'manual'
            actor: rollback.actor,
            workflow_run_id: rollback.workflow_run_id,
            status: rollback.status || 'in_progress'
        };

        history.rollbacks.unshift(record);

        // Keep only last 100 rollbacks
        if (history.rollbacks.length > 100) {
            history.rollbacks = history.rollbacks.slice(0, 100);
        }

        this.saveDeploymentHistory(history);
        return record;
    }

    /**
     * Get rollback candidates for an environment
     * @param {string} environment - Environment name
     * @param {number} limit - Number of candidates to return
     */
    getRollbackCandidates(environment, limit = 10) {
        const history = this.getDeploymentHistory();

        return history.deployments
            .filter(d => d.environment === environment && d.status === 'success')
            .slice(0, limit)
            .map(d => ({
                version: d.version,
                commit: d.commit,
                timestamp: d.timestamp,
                actor: d.actor,
                deployment_url: d.deployment_url
            }));
    }

    /**
     * Validate rollback target
     * @param {string} environment - Environment name
     * @param {string} targetVersion - Target version to rollback to
     */
    validateRollbackTarget(environment, targetVersion) {
        const history = this.getDeploymentHistory();

        const targetDeployment = history.deployments.find(d =>
            d.environment === environment &&
            (d.version === targetVersion || d.commit === targetVersion) &&
            d.status === 'success'
        );

        if (!targetDeployment) {
            throw new Error(`No successful deployment found for version ${targetVersion} in ${environment}`);
        }

        // Check if target is not too old (e.g., more than 30 days)
        const targetDate = new Date(targetDeployment.timestamp);
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        if (targetDate < thirtyDaysAgo) {
            console.warn(`Warning: Target version ${targetVersion} is older than 30 days`);
        }

        return targetDeployment;
    }

    /**
     * Generate rollback report
     * @param {string} environment - Environment name (optional)
     */
    generateRollbackReport(environment = null) {
        const history = this.getDeploymentHistory();

        let rollbacks = history.rollbacks;
        if (environment) {
            rollbacks = rollbacks.filter(r => r.environment === environment);
        }

        const report = {
            total_rollbacks: rollbacks.length,
            successful_rollbacks: rollbacks.filter(r => r.status === 'success').length,
            failed_rollbacks: rollbacks.filter(r => r.status === 'failed').length,
            automatic_rollbacks: rollbacks.filter(r => r.type === 'automatic').length,
            manual_rollbacks: rollbacks.filter(r => r.type === 'manual').length,
            recent_rollbacks: rollbacks.slice(0, 10),
            environments: {}
        };

        // Group by environment
        const environments = [...new Set(rollbacks.map(r => r.environment))];
        environments.forEach(env => {
            const envRollbacks = rollbacks.filter(r => r.environment === env);
            report.environments[env] = {
                total: envRollbacks.length,
                successful: envRollbacks.filter(r => r.status === 'success').length,
                failed: envRollbacks.filter(r => r.status === 'failed').length,
                last_rollback: envRollbacks[0] || null
            };
        });

        return report;
    }
}

/**
 * CLI interface for rollback utilities
 */
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    const manager = new RollbackManager();

    try {
        switch (command) {
            case 'record-deployment':
                const deployment = {
                    environment: args[1],
                    version: args[2],
                    commit: args[3],
                    actor: process.env.GITHUB_ACTOR,
                    workflow_run_id: process.env.GITHUB_RUN_ID,
                    deployment_url: args[4]
                };
                const record = manager.recordDeployment(deployment);
                console.log('Deployment recorded:', JSON.stringify(record, null, 2));
                break;

            case 'get-rollback-target':
                const environment = args[1];
                const excludeVersion = args[2];
                const target = manager.getLastSuccessfulDeployment(environment, excludeVersion);
                if (target) {
                    console.log(JSON.stringify(target, null, 2));
                } else {
                    console.error(`No rollback target found for ${environment}`);
                    process.exit(1);
                }
                break;

            case 'record-rollback':
                const rollback = {
                    environment: args[1],
                    from_version: args[2],
                    to_version: args[3],
                    reason: args[4],
                    type: args[5] || 'manual',
                    actor: process.env.GITHUB_ACTOR,
                    workflow_run_id: process.env.GITHUB_RUN_ID,
                    status: args[6] || 'success'
                };
                const rollbackRecord = manager.recordRollback(rollback);
                console.log('Rollback recorded:', JSON.stringify(rollbackRecord, null, 2));
                break;

            case 'get-candidates':
                const env = args[1];
                const limit = parseInt(args[2]) || 10;
                const candidates = manager.getRollbackCandidates(env, limit);
                console.log(JSON.stringify(candidates, null, 2));
                break;

            case 'validate-target':
                const validateEnv = args[1];
                const targetVersion = args[2];
                const validation = manager.validateRollbackTarget(validateEnv, targetVersion);
                console.log('Validation successful:', JSON.stringify(validation, null, 2));
                break;

            case 'report':
                const reportEnv = args[1];
                const report = manager.generateRollbackReport(reportEnv);
                console.log(JSON.stringify(report, null, 2));
                break;

            default:
                console.error(`Unknown command: ${command}`);
                console.error('Usage: node rollback-utils.js <command> [args...]');
                console.error('Commands:');
                console.error('  record-deployment <env> <version> <commit> [url]');
                console.error('  get-rollback-target <env> [exclude-version]');
                console.error('  record-rollback <env> <from> <to> <reason> [type] [status]');
                console.error('  get-candidates <env> [limit]');
                console.error('  validate-target <env> <version>');
                console.error('  report [env]');
                process.exit(1);
        }
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { RollbackManager };
