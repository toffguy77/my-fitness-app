import { test as setup } from '@playwright/test'
import { getAccount } from './test-accounts'

const authFiles: Record<string, string> = {
  'setup:client': 'e2e/.auth/client.json',
  'setup:curator': 'e2e/.auth/curator.json',
  'setup:admin': 'e2e/.auth/admin.json',
}

const roleMap: Record<string, string> = {
  'setup:client': 'client',
  'setup:curator': 'curator',
  'setup:admin': 'admin',
}

setup('authenticate', async ({ page }, testInfo) => {
  const projectName = testInfo.project.name
  const role = roleMap[projectName]
  const authFile = authFiles[projectName]

  if (!role || !authFile) {
    throw new Error(`Unknown setup project: ${projectName}`)
  }

  const account = getAccount(role)

  await page.goto('/auth')
  await page.getByLabel('Email address').fill(account.email)
  await page.getByLabel('Password').fill(account.password)
  await page.getByLabel('Log in to your account').click()

  // Wait for role-specific redirect
  await page.waitForURL(`**${account.expectedRedirect}**`, { timeout: 15000 })

  // Save storage state (localStorage with JWT + cookies)
  await page.context().storageState({ path: authFile })
})
