import { useState, useEffect } from 'react'
import { apiClient } from '@/shared/utils/api-client'

interface User {
    id: string
    email: string
    name: string
    role: string
}

interface AuthState {
    user: User | null
    isLoading: boolean
    login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
    logout: () => Promise<void>
}

export function useAuth(): AuthState {
    const [user, setUser] = useState<User | null>(null)
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        const loadUser = async () => {
            try {
                const token = localStorage.getItem('auth_token')
                if (!token) {
                    setIsLoading(false)
                    return
                }

                const data = await apiClient.get<{ user: User }>('/api/v1/auth/me')
                setUser(data.user)
            } catch (err) {
                console.error('Failed to load user:', err)
            } finally {
                setIsLoading(false)
            }
        }

        loadUser()
    }, [])

    const login = async (email: string, password: string) => {
        try {
            const data = await apiClient.post<{ user: User; token: string }>(
                '/api/v1/auth/login',
                { email, password }
            )
            setUser(data.user)
            localStorage.setItem('auth_token', data.token)
            return { success: true }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Login failed'
            return { success: false, error: message }
        }
    }

    const logout = async () => {
        localStorage.removeItem('auth_token')
        setUser(null)
    }

    return {
        user,
        isLoading,
        login,
        logout,
    }
}
