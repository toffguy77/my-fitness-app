/**
 * HTTP API client utility with fetch wrapper
 * Provides centralized request handling with authentication and error management
 */

interface RequestOptions extends RequestInit {
    headers?: Record<string, string>;
}

class ApiClient {
    /**
     * Make an HTTP request with automatic token injection and error handling
     */
    private async request<T>(url: string, options: RequestOptions = {}): Promise<T> {
        const token = this.getToken();

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...options.headers,
        };

        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(url, {
            ...options,
            headers,
        });

        if (!response.ok) {
            const error: any = new Error('API request failed');
            error.response = {
                status: response.status,
                data: await response.json().catch(() => ({})),
            };
            throw error;
        }

        const data = await response.json();
        // Handle both {data: ...} and direct response formats
        return data.data || data;
    }

    /**
     * Make a GET request
     */
    async get<T>(url: string, options?: RequestOptions): Promise<T> {
        return this.request<T>(url, { ...options, method: 'GET' });
    }

    /**
     * Make a POST request
     */
    async post<T>(url: string, body: any, options?: RequestOptions): Promise<T> {
        return this.request<T>(url, {
            ...options,
            method: 'POST',
            body: JSON.stringify(body),
        });
    }

    /**
     * Make a PUT request
     */
    async put<T>(url: string, body: any, options?: RequestOptions): Promise<T> {
        return this.request<T>(url, {
            ...options,
            method: 'PUT',
            body: JSON.stringify(body),
        });
    }

    /**
     * Make a DELETE request
     */
    async delete<T>(url: string, options?: RequestOptions): Promise<T> {
        return this.request<T>(url, { ...options, method: 'DELETE' });
    }

    /**
     * Get JWT token from localStorage
     */
    private getToken(): string | null {
        if (typeof window === 'undefined') return null;
        return localStorage.getItem('auth_token');
    }

    /**
     * Store JWT token in localStorage
     */
    setToken(token: string): void {
        if (typeof window === 'undefined') return;
        localStorage.setItem('auth_token', token);
    }

    /**
     * Remove JWT token from localStorage
     */
    clearToken(): void {
        if (typeof window === 'undefined') return;
        localStorage.removeItem('auth_token');
    }
}

export const apiClient = new ApiClient();
