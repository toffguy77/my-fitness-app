'use client'

import React, { Component, ErrorInfo, ReactNode } from 'react'
import { logger } from '../utils/logger'

interface Props {
    children: ReactNode
    fallback?: ReactNode
    onError?: (error: Error, errorInfo: ErrorInfo) => void
}

interface State {
    hasError: boolean
    error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props)
        this.state = { hasError: false }
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error }
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        // Log error to our logging system
        logger.error('React Error Boundary caught an error', error, {
            componentStack: errorInfo.componentStack,
            errorBoundary: true,
        })

        // Call custom error handler if provided
        this.props.onError?.(error, errorInfo)
    }

    render() {
        if (this.state.hasError) {
            // Custom fallback UI
            if (this.props.fallback) {
                return this.props.fallback
            }

            // Default fallback UI
            return (
                <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
                    <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-6">
                        <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 rounded-full">
                            <svg
                                className="w-6 h-6 text-red-600"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                                />
                            </svg>
                        </div>
                        <h2 className="mt-4 text-xl font-semibold text-center text-gray-900">
                            Что-то пошло не так
                        </h2>
                        <p className="mt-2 text-sm text-center text-gray-600">
                            Произошла непредвиденная ошибка. Мы уже получили уведомление и работаем над исправлением.
                        </p>
                        <button
                            onClick={() => window.location.reload()}
                            className="mt-6 w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
                        >
                            Перезагрузить страницу
                        </button>
                    </div>
                </div>
            )
        }

        return this.props.children
    }
}
