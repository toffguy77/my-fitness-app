import { useState, useEffect } from 'react'

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

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

export function useAuth(): AuthState {
    const [user, setUser] = useState<User | null>(null)
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        const loadUser = async () => {
            try {
                const token = localStorage.getItem('token')
                if (!token) {
                    setIsLoading(false)
                    return
                }

                const response = await fetch(`${API_URL}/auth/me`, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                })

                if (response.ok) {
                    const data = await response.json()
                    setUser(data.data.user)
                }
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
            const response = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password }),
            })

            const data = await response.json()

            if (response.ok) {
                setUser(data.data.user)
                localStorage.setItem('token', data.data.token)
                return { success: true }
            }

            return { success: false, error: data.message || 'Login failed' }
        } catch {
            return { success: false, error: 'Network error' }
        }
    }

    const logout = async () => {
        localStorage.removeItem('token')
        setUser(null)
    }

    return {
        user,
        isLoading,
        login,
        logout,
    }
}
