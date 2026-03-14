export interface TestAccount {
  email: string
  password: string
  role: 'client' | 'curator' | 'admin'
  expectedRedirect: string
}

function env(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Set it in .env or pass via CLI.`,
    )
  }
  return value
}

function createAccount(
  emailVar: string,
  passwordVar: string,
  role: TestAccount['role'],
  expectedRedirect: string,
): TestAccount {
  return {
    get email() {
      return env(emailVar)
    },
    get password() {
      return env(passwordVar)
    },
    role,
    expectedRedirect,
  }
}

export const accounts: Record<string, TestAccount> = {
  client: createAccount('E2E_CLIENT_EMAIL', 'E2E_CLIENT_PASSWORD', 'client', '/dashboard'),
  curator: createAccount('E2E_CURATOR_EMAIL', 'E2E_CURATOR_PASSWORD', 'curator', '/curator'),
  admin: createAccount('E2E_ADMIN_EMAIL', 'E2E_ADMIN_PASSWORD', 'admin', '/admin'),
}

export function getAccount(role: string): TestAccount {
  const account = accounts[role]
  if (!account) {
    throw new Error(`Unknown test account role: ${role}`)
  }
  return account
}
