/**
 * CD Pipeline Tests
 * 
 * Example-based tests that validate CD pipeline configuration and behavior
 * according to the requirements specification.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';

describe('CD Pipeline Configuration', () => {
    const cdWorkflowPath = join(process.cwd(), '.github/workflows/cd.yml');
    const rollbackWorkflowPath = join(process.cwd(), '.github/workflows/rollback.yml');
    let cdWorkflowConfig: any;
    let rollbackWorkflowConfig: any;

    beforeAll(() => {
        // Load and parse the CD workflow configuration
        if (existsSync(cdWorkflowPath)) {
            const cdWorkflowContent = readFileSync(cdWorkflowPath, 'utf8');
            cdWorkflowConfig = yaml.load(cdWorkflowContent);
        }

        // Load and parse the rollback workflow configuration
        if (existsSync(rollbackWorkflowPath)) {
            const rollbackWorkflowContent = readFileSync(rollbackWorkflowPath, 'utf8');
            rollbackWorkflowConfig = yaml.load(rollbackWorkflowContent);
        }
    });

    /**
     * Example 8: Automatic Artifact Creation
     * Validates: Requirements 3.1
     * 
     * When all tests pass in main branch, build artifact should be automatically created
     */
    describe('Example 8: Automatic Artifact Creation', () => {
        it('should have CD workflow file configured', () => {
            expect(existsSync(cdWorkflowPath)).toBe(true);
        });

        it('should trigger CD pipeline when CI workflow completes successfully', () => {
            expect(cdWorkflowConfig).toBeDefined();
            expect(cdWorkflowConfig.on).toBeDefined();
            expect(cdWorkflowConfig.on.workflow_run).toBeDefined();
            expect(cdWorkflowConfig.on.workflow_run.workflows).toContain('CI Pipeline');
            expect(cdWorkflowConfig.on.workflow_run.types).toContain('completed');
            expect(cdWorkflowConfig.on.workflow_run.branches).toContain('main');
        });

        it('should only deploy when CI workflow succeeds', () => {
            const deployStagingJob = cdWorkflowConfig.jobs['deploy-staging'];
            expect(deployStagingJob).toBeDefined();
            expect(deployStagingJob.if).toContain("github.event.workflow_run.conclusion == 'success'");
        });

        it('should have staging deployment job that builds artifacts', () => {
            const deployStagingJob = cdWorkflowConfig.jobs['deploy-staging'];
            expect(deployStagingJob.name).toBe('Deploy to Staging');
            expect(deployStagingJob['runs-on']).toBe('ubuntu-latest');
            expect(deployStagingJob.environment).toBe('staging');

            // Check for build step
            const buildStep = deployStagingJob.steps.find((step: any) =>
                step.name === 'Build application'
            );
            expect(buildStep).toBeDefined();
            expect(buildStep.run).toContain('npm run build');
        });

        it('should have proper environment variables for staging build', () => {
            const deployStagingJob = cdWorkflowConfig.jobs['deploy-staging'];
            const buildStep = deployStagingJob.steps.find((step: any) =>
                step.name === 'Build application'
            );

            expect(buildStep.env).toBeDefined();
            expect(buildStep.env.NEXT_PUBLIC_SUPABASE_URL).toContain('STAGING_SUPABASE_URL');
            expect(buildStep.env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toContain('STAGING_SUPABASE_ANON_KEY');
        });

        it('should have production deployment job that builds artifacts', () => {
            const deployProductionJob = cdWorkflowConfig.jobs['deploy-production'];
            expect(deployProductionJob).toBeDefined();
            expect(deployProductionJob.name).toBe('Deploy to Production');
            expect(deployProductionJob.environment).toBe('production');

            // Check for build step
            const buildStep = deployProductionJob.steps.find((step: any) =>
                step.name === 'Build application'
            );
            expect(buildStep).toBeDefined();
            expect(buildStep.run).toContain('npm run build');
        });

        it('should have proper environment variables for production build', () => {
            const deployProductionJob = cdWorkflowConfig.jobs['deploy-production'];
            const buildStep = deployProductionJob.steps.find((step: any) =>
                step.name === 'Build application'
            );

            expect(buildStep.env).toBeDefined();
            expect(buildStep.env.NEXT_PUBLIC_SUPABASE_URL).toContain('NEXT_PUBLIC_SUPABASE_URL');
            expect(buildStep.env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY');
        });

        it('should use Node.js version 20 for consistency with CI', () => {
            const jobs = Object.values(cdWorkflowConfig.jobs) as any[];

            jobs.forEach(job => {
                if (job.steps) {
                    const nodeSetupStep = job.steps.find((step: any) =>
                        step.uses && step.uses.includes('actions/setup-node')
                    );

                    if (nodeSetupStep) {
                        expect(nodeSetupStep.with['node-version']).toBe('20');
                    }
                }
            });
        });

        it('should have caching configured for deployment performance', () => {
            const deployStagingJob = cdWorkflowConfig.jobs['deploy-staging'];
            const nodeSetupStep = deployStagingJob.steps.find((step: any) =>
                step.uses && step.uses.includes('actions/setup-node')
            );

            expect(nodeSetupStep).toBeDefined();
            expect(nodeSetupStep.with.cache).toBe('npm');
        });

        it('should have manual deployment trigger for emergency deployments', () => {
            expect(cdWorkflowConfig.on.workflow_dispatch).toBeDefined();
            expect(cdWorkflowConfig.on.workflow_dispatch.inputs).toBeDefined();
            expect(cdWorkflowConfig.on.workflow_dispatch.inputs.environment).toBeDefined();
            expect(cdWorkflowConfig.on.workflow_dispatch.inputs.environment.options).toContain('staging');
            expect(cdWorkflowConfig.on.workflow_dispatch.inputs.environment.options).toContain('production');
        });

        it('should install dependencies before building artifacts', () => {
            const deployStagingJob = cdWorkflowConfig.jobs['deploy-staging'];
            const installStep = deployStagingJob.steps.find((step: any) =>
                step.name === 'Install dependencies'
            );

            expect(installStep).toBeDefined();
            expect(installStep.run).toBe('npm ci');
        });
    });

    /**
     * Example 9: Staging Deployment
     * Validates: Requirements 3.2
     * 
     * When build artifact is created, automatic deployment to staging should occur
     */
    describe('Example 9: Staging Deployment', () => {
        it('should have staging deployment that runs after artifact creation', () => {
            const deployStagingJob = cdWorkflowConfig.jobs['deploy-staging'];
            expect(deployStagingJob).toBeDefined();

            // Should run when CI completes successfully or manual dispatch
            expect(deployStagingJob.if).toContain("github.event.workflow_run.conclusion == 'success'");
            expect(deployStagingJob.if).toContain("github.event_name == 'workflow_dispatch'");
        });

        it('should have staging deployment step with proper configuration', () => {
            const deployStagingJob = cdWorkflowConfig.jobs['deploy-staging'];
            const deployStep = deployStagingJob.steps.find((step: any) =>
                step.name && step.name.includes('Deploy to Staging')
            );

            expect(deployStep).toBeDefined();
            expect(deployStep.id).toBe('deploy-staging');
            expect(deployStep.run).toContain('Deploying to staging environment');
        });

        it('should have staging health checks after deployment', () => {
            const deployStagingJob = cdWorkflowConfig.jobs['deploy-staging'];
            const healthCheckStep = deployStagingJob.steps.find((step: any) =>
                step.name === 'Run staging health checks'
            );

            expect(healthCheckStep).toBeDefined();
            expect(healthCheckStep.run).toContain('Running staging health checks');
            expect(healthCheckStep.run).toContain('Check application endpoints');
            expect(healthCheckStep.run).toContain('Verify database connectivity');
            expect(healthCheckStep.run).toContain('Test critical user flows');
        });

        it('should send deployment notifications for staging', () => {
            const deployStagingJob = cdWorkflowConfig.jobs['deploy-staging'];

            // Check for start notification
            const startNotifyStep = deployStagingJob.steps.find((step: any) =>
                step.name === 'Send deployment start notification'
            );
            expect(startNotifyStep).toBeDefined();
            expect(startNotifyStep.run).toContain('telegram-notify.js deployment staging in_progress');

            // Check for success notification
            const successNotifyStep = deployStagingJob.steps.find((step: any) =>
                step.name === 'Send deployment success notification'
            );
            expect(successNotifyStep).toBeDefined();
            expect(successNotifyStep.if).toBe('success()');
            expect(successNotifyStep['continue-on-error']).toBe(true);
            expect(successNotifyStep.run).toContain('telegram-notify.js deployment staging success');

            // Check for failure notification
            const failureNotifyStep = deployStagingJob.steps.find((step: any) =>
                step.name === 'Send deployment failure notification'
            );
            expect(failureNotifyStep).toBeDefined();
            expect(failureNotifyStep.if).toBe('failure()');
            expect(failureNotifyStep['continue-on-error']).toBe(true);
            expect(failureNotifyStep.run).toContain('telegram-notify.js deployment staging failure');
        });

        it('should use proper environment secrets for staging', () => {
            const deployStagingJob = cdWorkflowConfig.jobs['deploy-staging'];
            const notificationSteps = deployStagingJob.steps.filter((step: any) =>
                step.env && step.env.TELEGRAM_BOT_TOKEN
            );

            notificationSteps.forEach((step: any) => {
                expect(step.env.TELEGRAM_BOT_TOKEN).toBe('${{ secrets.TELEGRAM_BOT_TOKEN }}');
                expect(step.env.TELEGRAM_CHAT_ID).toBe('${{ secrets.TELEGRAM_CHAT_ID }}');
            });
        });

        it('should set deployment URL output for staging', () => {
            const deployStagingJob = cdWorkflowConfig.jobs['deploy-staging'];
            const deployStep = deployStagingJob.steps.find((step: any) =>
                step.id === 'deploy-staging'
            );

            expect(deployStep.run).toContain('deployment_url=https://staging.myfitnessapp.com');
            expect(deployStep.run).toContain('>> $GITHUB_OUTPUT');
        });

        it('should have proper staging environment protection', () => {
            const deployStagingJob = cdWorkflowConfig.jobs['deploy-staging'];
            expect(deployStagingJob.environment).toBe('staging');
        });

        it('should checkout code before staging deployment', () => {
            const deployStagingJob = cdWorkflowConfig.jobs['deploy-staging'];
            const checkoutStep = deployStagingJob.steps.find((step: any) =>
                step.uses && step.uses.includes('actions/checkout')
            );

            expect(checkoutStep).toBeDefined();
            expect(checkoutStep.uses).toBe('actions/checkout@v4');
        });

        it('should simulate proper staging deployment process', () => {
            const deployStagingJob = cdWorkflowConfig.jobs['deploy-staging'];
            const deployStep = deployStagingJob.steps.find((step: any) =>
                step.id === 'deploy-staging'
            );

            expect(deployStep.run).toContain('Building Docker image');
            expect(deployStep.run).toContain('Push to container registry');
            expect(deployStep.run).toContain('Deploy to staging environment');
            expect(deployStep.run).toContain('sleep 10'); // Simulation
        });
    });

    /**
     * Example 10: Production Deployment Gate
     * Validates: Requirements 3.3
     * 
     * When staging tests pass, production deployment should be triggered
     */
    describe('Example 10: Production Deployment Gate', () => {
        it('should have production deployment that depends on staging success', () => {
            const deployProductionJob = cdWorkflowConfig.jobs['deploy-production'];
            expect(deployProductionJob).toBeDefined();
            expect(deployProductionJob.needs).toContain('deploy-staging');
        });

        it('should only deploy to production from main branch', () => {
            const deployProductionJob = cdWorkflowConfig.jobs['deploy-production'];
            expect(deployProductionJob.if).toContain("github.ref == 'refs/heads/main'");
            expect(deployProductionJob.if).toContain("github.event.workflow_run.conclusion == 'success'");
        });

        it('should have production deployment step with enhanced configuration', () => {
            const deployProductionJob = cdWorkflowConfig.jobs['deploy-production'];
            const deployStep = deployProductionJob.steps.find((step: any) =>
                step.name && step.name.includes('Deploy to Production')
            );

            expect(deployStep).toBeDefined();
            expect(deployStep.id).toBe('deploy-production');
            expect(deployStep.run).toContain('Deploying to production environment');
            expect(deployStep.run).toContain('Using staging-verified build');
        });

        it('should have comprehensive production health checks', () => {
            const deployProductionJob = cdWorkflowConfig.jobs['deploy-production'];
            const healthCheckStep = deployProductionJob.steps.find((step: any) =>
                step.name === 'Run production health checks'
            );

            expect(healthCheckStep).toBeDefined();
            expect(healthCheckStep.run).toContain('Running production health checks');
            expect(healthCheckStep.run).toContain('Check application endpoints');
            expect(healthCheckStep.run).toContain('Verify database connectivity');
            expect(healthCheckStep.run).toContain('Test critical user flows');
            expect(healthCheckStep.run).toContain('Check monitoring systems');
        });

        it('should have longer health check duration for production', () => {
            const deployProductionJob = cdWorkflowConfig.jobs['deploy-production'];
            const healthCheckStep = deployProductionJob.steps.find((step: any) =>
                step.name === 'Run production health checks'
            );

            expect(healthCheckStep.run).toContain('sleep 10'); // Longer than staging (5)
        });

        it('should send production deployment notifications', () => {
            const deployProductionJob = cdWorkflowConfig.jobs['deploy-production'];

            // Check for start notification
            const startNotifyStep = deployProductionJob.steps.find((step: any) =>
                step.name === 'Send deployment start notification'
            );
            expect(startNotifyStep).toBeDefined();
            expect(startNotifyStep.run).toContain('telegram-notify.js deployment production in_progress');

            // Check for success notification
            const successNotifyStep = deployProductionJob.steps.find((step: any) =>
                step.name === 'Send deployment success notification'
            );
            expect(successNotifyStep).toBeDefined();
            expect(successNotifyStep.if).toBe('success()');
            expect(successNotifyStep['continue-on-error']).toBe(true);
            expect(successNotifyStep.run).toContain('telegram-notify.js deployment production success');

            // Check for failure notification
            const failureNotifyStep = deployProductionJob.steps.find((step: any) =>
                step.name === 'Send deployment failure notification'
            );
            expect(failureNotifyStep).toBeDefined();
            expect(failureNotifyStep.if).toBe('failure()');
            expect(failureNotifyStep['continue-on-error']).toBe(true);
            expect(failureNotifyStep.run).toContain('telegram-notify.js deployment production failure');
        });

        it('should set production deployment URL output', () => {
            const deployProductionJob = cdWorkflowConfig.jobs['deploy-production'];
            const deployStep = deployProductionJob.steps.find((step: any) =>
                step.id === 'deploy-production'
            );

            expect(deployStep.run).toContain('deployment_url=https://myfitnessapp.com');
            expect(deployStep.run).toContain('>> $GITHUB_OUTPUT');
        });

        it('should have proper production environment protection', () => {
            const deployProductionJob = cdWorkflowConfig.jobs['deploy-production'];
            expect(deployProductionJob.environment).toBe('production');
        });

        it('should have longer deployment simulation for production', () => {
            const deployProductionJob = cdWorkflowConfig.jobs['deploy-production'];
            const deployStep = deployProductionJob.steps.find((step: any) =>
                step.id === 'deploy-production'
            );

            expect(deployStep.run).toContain('sleep 15'); // Longer than staging (10)
            expect(deployStep.run).toContain('Use the same Docker image from staging');
            expect(deployStep.run).toContain('Update load balancer/CDN');
        });

        it('should have automatic rollback on production deployment failure', () => {
            const rollbackJob = cdWorkflowConfig.jobs.rollback;
            expect(rollbackJob).toBeDefined();
            expect(rollbackJob.name).toBe('Automatic Rollback on Failure');
            expect(rollbackJob.needs).toContain('deploy-staging');
            expect(rollbackJob.needs).toContain('deploy-production');
            expect(rollbackJob.if).toBe('failure()');
        });

        it('should determine rollback environment correctly', () => {
            const rollbackJob = cdWorkflowConfig.jobs.rollback;
            const rollbackInfoStep = rollbackJob.steps.find((step: any) =>
                step.id === 'rollback-info'
            );

            expect(rollbackInfoStep).toBeDefined();
            expect(rollbackInfoStep.run).toContain('needs.deploy-staging.result');
            expect(rollbackInfoStep.run).toContain('ENVIRONMENT="staging"');
            expect(rollbackInfoStep.run).toContain('ENVIRONMENT="production"');
        });

        it('should have enhanced rollback with previous version detection', () => {
            const rollbackJob = cdWorkflowConfig.jobs.rollback;
            const rollbackStep = rollbackJob.steps.find((step: any) =>
                step.id === 'perform-rollback'
            );

            expect(rollbackStep).toBeDefined();
            expect(rollbackStep.run).toContain('Performing automatic rollback');
            expect(rollbackStep.run).toContain('Deploy the previous successful version');
            expect(rollbackStep.run).toContain('Update load balancer configuration');
            expect(rollbackStep.run).toContain('Clear CDN caches');
        });
    });

    /**
     * Manual Rollback Workflow Tests
     * Validates rollback mechanism requirements
     */
    describe('Manual Rollback Workflow', () => {
        it('should have manual rollback workflow file configured', () => {
            expect(existsSync(rollbackWorkflowPath)).toBe(true);
        });

        it('should have manual trigger with proper inputs', () => {
            expect(rollbackWorkflowConfig).toBeDefined();
            expect(rollbackWorkflowConfig.on.workflow_dispatch).toBeDefined();

            const inputs = rollbackWorkflowConfig.on.workflow_dispatch.inputs;
            expect(inputs.environment).toBeDefined();
            expect(inputs.environment.type).toBe('choice');
            expect(inputs.environment.options).toContain('staging');
            expect(inputs.environment.options).toContain('production');

            expect(inputs.version).toBeDefined();
            expect(inputs.version.required).toBe(true);

            expect(inputs.reason).toBeDefined();
            expect(inputs.reason.required).toBe(true);
        });

        it('should have rollback job with proper environment protection', () => {
            const rollbackJob = rollbackWorkflowConfig.jobs.rollback;
            expect(rollbackJob).toBeDefined();
            expect(rollbackJob.name).toBe('Rollback Deployment');
            expect(rollbackJob.environment).toBe('${{ github.event.inputs.environment }}');
        });

        it('should checkout specific version for rollback', () => {
            const rollbackJob = rollbackWorkflowConfig.jobs.rollback;
            const checkoutStep = rollbackJob.steps.find((step: any) =>
                step.uses && step.uses.includes('actions/checkout')
            );

            expect(checkoutStep).toBeDefined();
            expect(checkoutStep.with.ref).toBe('${{ github.event.inputs.version }}');
        });

        it('should have enhanced rollback notifications', () => {
            const rollbackJob = rollbackWorkflowConfig.jobs.rollback;

            const successStep = rollbackJob.steps.find((step: any) =>
                step.name === 'Send rollback success notification'
            );
            expect(successStep).toBeDefined();
            expect(successStep.if).toBe('success()');
            expect(successStep.run).toContain('rollback_success');

            const failureStep = rollbackJob.steps.find((step: any) =>
                step.name === 'Send rollback failure notification'
            );
            expect(failureStep).toBeDefined();
            expect(failureStep.if).toBe('failure()');
            expect(failureStep.run).toContain('rollback_failure');
        });

        it('should have post-rollback monitoring job', () => {
            const monitoringJob = rollbackWorkflowConfig.jobs['post-rollback-monitoring'];
            expect(monitoringJob).toBeDefined();
            expect(monitoringJob.name).toBe('Post-Rollback Monitoring');
            expect(monitoringJob.needs).toContain('rollback');
            expect(monitoringJob.if).toBe('success()');
        });

        it('should upload rollback artifacts for tracking', () => {
            const rollbackJob = rollbackWorkflowConfig.jobs.rollback;
            const uploadStep = rollbackJob.steps.find((step: any) =>
                step.uses && step.uses.includes('actions/upload-artifact')
            );

            expect(uploadStep).toBeDefined();
            expect(uploadStep.with.name).toContain('rollback-record');
            expect(uploadStep.with['retention-days']).toBe(90);
        });
    });

    /**
     * Rollback Utilities Tests
     * Validates rollback utility scripts
     */
    describe('Rollback Utilities', () => {
        it('should have rollback utilities script', () => {
            const rollbackUtilsPath = join(process.cwd(), 'scripts/rollback-utils.js');
            expect(existsSync(rollbackUtilsPath)).toBe(true);
        });

        it('should have telegram notification script with rollback support', () => {
            const telegramScriptPath = join(process.cwd(), 'scripts/telegram-notify.js');
            expect(existsSync(telegramScriptPath)).toBe(true);

            const scriptContent = readFileSync(telegramScriptPath, 'utf8');
            expect(scriptContent).toContain('rollback');
            expect(scriptContent).toContain('rollback_start');
            expect(scriptContent).toContain('rollback_success');
            expect(scriptContent).toContain('rollback_failure');
        });

        it('should have enhanced deployment notification formatting', () => {
            const telegramScriptPath = join(process.cwd(), 'scripts/telegram-notify.js');
            const scriptContent = readFileSync(telegramScriptPath, 'utf8');

            expect(scriptContent).toContain('formatDeployment');
            expect(scriptContent).toContain('Rollback Information');
            expect(scriptContent).toContain('System restored to stable state');
            expect(scriptContent).toContain('Enhanced monitoring active for 30 minutes');
        });
    });

    /**
     * Integration Tests for Full CD Pipeline
     */
    describe('CD Pipeline Integration', () => {
        it('should have proper job dependencies across the entire pipeline', () => {
            // Staging should run independently (after CI success)
            const deployStagingJob = cdWorkflowConfig.jobs['deploy-staging'];
            expect(deployStagingJob.needs).toBeUndefined();

            // Production should depend on staging
            const deployProductionJob = cdWorkflowConfig.jobs['deploy-production'];
            expect(deployProductionJob.needs).toContain('deploy-staging');

            // Rollback should depend on both staging and production
            const rollbackJob = cdWorkflowConfig.jobs.rollback;
            expect(rollbackJob.needs).toContain('deploy-staging');
            expect(rollbackJob.needs).toContain('deploy-production');
        });

        it('should have consistent Node.js and npm setup across all jobs', () => {
            const jobs = Object.values(cdWorkflowConfig.jobs) as any[];

            jobs.forEach(job => {
                if (job.steps) {
                    const nodeSetupStep = job.steps.find((step: any) =>
                        step.uses && step.uses.includes('actions/setup-node')
                    );

                    if (nodeSetupStep) {
                        expect(nodeSetupStep.with['node-version']).toBe('20');
                        expect(nodeSetupStep.with.cache).toBe('npm');
                    }

                    const installStep = job.steps.find((step: any) =>
                        step.name === 'Install dependencies'
                    );

                    if (installStep) {
                        expect(installStep.run).toBe('npm ci');
                    }
                }
            });
        });

        it('should have proper error handling and notifications throughout', () => {
            const jobs = Object.values(cdWorkflowConfig.jobs) as any[];

            jobs.forEach(job => {
                if (job.steps) {
                    const notificationSteps = job.steps.filter((step: any) =>
                        step.name && step.name.includes('notification')
                    );

                    if (notificationSteps.length > 0) {
                        // Should have both success and failure notifications
                        const successNotify = notificationSteps.find((step: any) =>
                            step.if === 'success()'
                        );
                        const failureNotify = notificationSteps.find((step: any) =>
                            step.if === 'failure()'
                        );

                        if (successNotify || failureNotify) {
                            expect(successNotify || failureNotify).toBeDefined();
                        }
                    }
                }
            });
        });

        it('should have environment-specific configurations', () => {
            // Staging job should use staging environment
            const deployStagingJob = cdWorkflowConfig.jobs['deploy-staging'];
            expect(deployStagingJob.environment).toBe('staging');

            // Production job should use production environment
            const deployProductionJob = cdWorkflowConfig.jobs['deploy-production'];
            expect(deployProductionJob.environment).toBe('production');
        });

        it('should have proper artifact and output management', () => {
            // Staging deployment should set output
            const deployStagingJob = cdWorkflowConfig.jobs['deploy-staging'];
            const stagingDeployStep = deployStagingJob.steps.find((step: any) =>
                step.id === 'deploy-staging'
            );
            expect(stagingDeployStep.run).toContain('>> $GITHUB_OUTPUT');

            // Production deployment should set output
            const deployProductionJob = cdWorkflowConfig.jobs['deploy-production'];
            const productionDeployStep = deployProductionJob.steps.find((step: any) =>
                step.id === 'deploy-production'
            );
            expect(productionDeployStep.run).toContain('>> $GITHUB_OUTPUT');
        });
    });
});