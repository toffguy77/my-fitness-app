'use client'

import React, { Component, ErrorInfo, ReactNode } from 'react'
import { ErrorState } from './ErrorState'
import { reportError } from '../errors/reportError'

interface Props {
    children: ReactNode
    /** Custom fallback. When omitted, an ErrorState is rendered. */
    fallback?: ReactNode
    /** Names the failing area in the log entry, e.g. "dashboard-chart". */
    label?: string
    /** `inline` keeps the rest of the page usable when a single widget fails. */
    variant?: 'page' | 'inline'
    onError?: (error: Error, errorInfo: ErrorInfo) => void
}

interface State {
    hasError: boolean
    error?: Error
    errorId?: string
}

/**
 * Catches render errors below it.
 *
 * Route-level failures are handled by App Router `error.tsx` files; this class
 * exists for finer granularity — a chart that throws should not take the whole
 * dashboard with it. It was previously written and tested but mounted nowhere,
 * so it caught nothing.
 */
export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props)
        this.state = { hasError: false }
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error }
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        const errorId = reportError(error, {
            source: 'error-boundary',
            label: this.props.label,
            componentStack: errorInfo.componentStack,
        })
        this.setState({ errorId })
        this.props.onError?.(error, errorInfo)
    }

    private reset = () => {
        this.setState({ hasError: false, error: undefined, errorId: undefined })
    }

    render() {
        if (!this.state.hasError) {
            return this.props.children
        }
        if (this.props.fallback) {
            return this.props.fallback
        }

        const inline = this.props.variant === 'inline'
        return (
            <ErrorState
                variant={this.props.variant ?? 'page'}
                title={inline ? 'Не удалось загрузить блок' : undefined}
                description={
                    inline
                        ? 'Остальная страница работает. Попробуйте обновить этот блок.'
                        : undefined
                }
                errorId={this.state.errorId}
                onRetry={this.reset}
                showHomeLink={!inline}
                debugDetail={this.state.error?.stack}
            />
        )
    }
}
