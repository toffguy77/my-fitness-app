// @ts-nocheck
/**
 * CD Pipeline Tests
 *
 * These tests validate that:
 * - staging deploys from develop to https://beta.burcev.team
 * - production deploys from main to https://burcev.team
 * - deployment happens after CI Pipeline succeeds (workflow_run)
 */

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import yaml from 'js-yaml'

interface WorkflowStep {
  name?: string
  run?: string
  env?: Record<string, string>
  uses?: string
  with?: Record<string, string | number>
  id?: string
  if?: string
  'continue-on-error'?: boolean
}

interface WorkflowJob {
  name?: string
  'runs-on'?: string
  environment?: string
  if?: string
  needs?: string | string[]
  steps?: WorkflowStep[]
}

interface WorkflowConfig {
  name?: string
  on?: {
    workflow_run?: {
      workflows?: string[]
      types?: string[]
      branches?: string[]
    }
    workflow_dispatch?: {
      inputs?: Record<
        string,
        {
          description?: string
          required?: boolean
          default?: string
          type?: string
          options?: string[]
        }
      >
    }
  }
  jobs?: Record<string, WorkflowJob>
}

describe('CD Pipeline Configuration', () => {
  const cdWorkflowPath = join(process.cwd(), '.github/workflows/cd.yml')
  const rollbackWorkflowPath = join(process.cwd(), '.github/workflows/rollback.yml')

  let cdWorkflowConfig: WorkflowConfig
  let rollbackWorkflowConfig: WorkflowConfig

  beforeAll(() => {
    if (existsSync(cdWorkflowPath)) {
      cdWorkflowConfig = yaml.load(readFileSync(cdWorkflowPath, 'utf8')) as WorkflowConfig
    }

    if (existsSync(rollbackWorkflowPath)) {
      rollbackWorkflowConfig = yaml.load(readFileSync(rollbackWorkflowPath, 'utf8')) as WorkflowConfig
    }
  })

  describe('CD workflow basics', () => {
    it('should have CD workflow file configured', () => {
      expect(existsSync(cdWorkflowPath)).toBe(true)
    })

    it('should trigger from CI workflow_run for main and develop', () => {
      expect(cdWorkflowConfig).toBeDefined()
      expect(cdWorkflowConfig?.on?.workflow_run).toBeDefined()
      expect(cdWorkflowConfig?.on?.workflow_run?.workflows).toContain('CI Pipeline')
      expect(cdWorkflowConfig?.on?.workflow_run?.types).toContain('completed')
      expect(cdWorkflowConfig?.on?.workflow_run?.branches).toContain('main')
      expect(cdWorkflowConfig?.on?.workflow_run?.branches).toContain('develop')
    })

    it('should have manual deployment trigger with environment + optional ref', () => {
      const inputs = cdWorkflowConfig?.on?.workflow_dispatch?.inputs
      expect(inputs).toBeDefined()

      expect(inputs.environment).toBeDefined()
      expect(inputs.environment.options).toContain('staging')
      expect(inputs.environment.options).toContain('production')

      expect(inputs.ref).toBeDefined()
      expect(inputs.ref.required).toBe(false)
    })
  })

  describe('Staging deployment (develop -> beta.burcev.team)', () => {
    it('should have staging job with correct gating', () => {
      const job = cdWorkflowConfig?.jobs?.['deploy-staging']
      expect(job).toBeDefined()
      expect(job.name).toBe('Deploy to Staging')
      expect(job.environment).toBe('staging')

      // must deploy only after CI success for develop OR manual staging
      expect(job.if).toContain("github.event.workflow_run.conclusion == 'success'")
      expect(job.if).toContain("github.event.workflow_run.head_branch == 'develop'")
      expect(job.if).toContain("github.event_name == 'workflow_dispatch'")
      expect(job.if).toContain("github.event.inputs.environment == 'staging'")
    })

    it('should build and push a staging image to GHCR', () => {
      const job = cdWorkflowConfig.jobs['deploy-staging']
      const buildStep = job.steps.find((s) => s.name === 'Build and push Docker image (staging)')
      expect(buildStep).toBeDefined()
      expect(buildStep.uses).toContain('docker/build-push-action')
      expect(buildStep.with.tags).toContain(':staging')
      expect(buildStep.with.tags).toContain(':staging-')
    })

    it('should deploy over SSH and set beta deployment_url output', () => {
      const job = cdWorkflowConfig.jobs['deploy-staging']
      const deployStep = job.steps.find((s) => s.id === 'deploy-staging')
      expect(deployStep).toBeDefined()
      expect(deployStep.name).toContain('VPS via SSH')
      expect(deployStep.run).toContain('ssh-keyscan')
      expect(deployStep.run).toContain('docker run -d')
      expect(deployStep.run).toContain('deployment_url=https://beta.burcev.team')
      expect(deployStep.env.HOST_PORT).toBe('3070')
    })
  })

  describe('Production deployment (main -> burcev.team)', () => {
    it('should have production job with correct gating', () => {
      const job = cdWorkflowConfig?.jobs?.['deploy-production']
      expect(job).toBeDefined()
      expect(job.name).toBe('Deploy to Production')
      expect(job.environment).toBe('production')

      // must deploy only after CI success for main OR manual production
      expect(job.if).toContain("github.event.workflow_run.conclusion == 'success'")
      expect(job.if).toContain("github.event.workflow_run.head_branch == 'main'")
      expect(job.if).toContain("github.event_name == 'workflow_dispatch'")
      expect(job.if).toContain("github.event.inputs.environment == 'production'")
    })

    it('should build and push a production image to GHCR', () => {
      const job = cdWorkflowConfig.jobs['deploy-production']
      const buildStep = job.steps.find((s) => s.name === 'Build and push Docker image (production)')
      expect(buildStep).toBeDefined()
      expect(buildStep.uses).toContain('docker/build-push-action')
      expect(buildStep.with.tags).toContain(':production')
      expect(buildStep.with.tags).toContain(':production-')
      expect(buildStep.with.tags).toContain(':latest')
    })

    it('should deploy over SSH and set burcev.team deployment_url output', () => {
      const job = cdWorkflowConfig.jobs['deploy-production']
      const deployStep = job.steps.find((s) => s.id === 'deploy-production')
      expect(deployStep).toBeDefined()
      expect(deployStep.name).toContain('VPS via SSH')
      expect(deployStep.run).toContain('ssh-keyscan')
      expect(deployStep.run).toContain('docker run -d')
      expect(deployStep.run).toContain('deployment_url=https://burcev.team')
      expect(deployStep.env.HOST_PORT).toBe('3069')
    })
  })

  describe('Rollback workflow presence', () => {
    it('should keep the manual rollback workflow file', () => {
      expect(existsSync(rollbackWorkflowPath)).toBe(true)
    })

    it('should have CD rollback job wired to staging+production results', () => {
      const rollbackJob = cdWorkflowConfig?.jobs?.rollback
      expect(rollbackJob).toBeDefined()
      expect(rollbackJob.name).toBe('Automatic Rollback on Failure')
      expect(rollbackJob.needs).toContain('deploy-staging')
      expect(rollbackJob.needs).toContain('deploy-production')
      expect(rollbackJob.if).toContain('needs.deploy-staging.result')
      expect(rollbackJob.if).toContain('needs.deploy-production.result')
    })

    it('should have manual rollback workflow trigger with proper inputs', () => {
      expect(rollbackWorkflowConfig).toBeDefined()
      expect(rollbackWorkflowConfig?.on?.workflow_dispatch).toBeDefined()

      const inputs = rollbackWorkflowConfig?.on?.workflow_dispatch.inputs
      expect(inputs.environment).toBeDefined()
      expect(inputs.environment.type).toBe('choice')
      expect(inputs.environment.options).toContain('staging')
      expect(inputs.environment.options).toContain('production')

      expect(inputs.version).toBeDefined()
      expect(inputs.version.required).toBe(true)

      expect(inputs.reason).toBeDefined()
      expect(inputs.reason.required).toBe(true)
    })
  })

  describe('Rollback utilities', () => {
    it('should have rollback utilities script', () => {
      const rollbackUtilsPath = join(process.cwd(), 'scripts/rollback-utils.js')
      expect(existsSync(rollbackUtilsPath)).toBe(true)
    })

    it('should have telegram notification script with rollback support', () => {
      const telegramScriptPath = join(process.cwd(), 'scripts/telegram-notify.js')
      expect(existsSync(telegramScriptPath)).toBe(true)

      const scriptContent = readFileSync(telegramScriptPath, 'utf8')
      expect(scriptContent).toContain('rollback')
      expect(scriptContent).toContain('rollback_start')
      expect(scriptContent).toContain('rollback_success')
      expect(scriptContent).toContain('rollback_failure')
    })
  })
})
