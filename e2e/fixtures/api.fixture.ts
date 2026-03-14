import { APIRequestContext } from '@playwright/test'

/**
 * API helper for direct backend calls (data cleanup, etc.)
 * Uses the JWT token from the authenticated session.
 */
export class ApiHelper {
  constructor(
    private request: APIRequestContext,
    private baseURL: string,
  ) {}

  private get apiBase() {
    return `${this.baseURL}/api/v1`
  }

  async delete(path: string): Promise<void> {
    const response = await this.request.delete(`${this.apiBase}${path}`)
    if (!response.ok() && response.status() !== 404) {
      throw new Error(`API DELETE ${path} failed: ${response.status()}`)
    }
  }

  async get<T>(path: string): Promise<T> {
    const response = await this.request.get(`${this.apiBase}${path}`)
    if (!response.ok()) {
      throw new Error(`API GET ${path} failed: ${response.status()}`)
    }
    return response.json()
  }
}
