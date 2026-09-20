/**
 * State for the pre-registration support widget.
 *
 * Not persisted: what survives a page reload is the token alone (widget.ts,
 * localStorage), and the transcript is re-read from the server whenever the
 * widget opens rather than carried in this store across a reload. A cached
 * copy of somebody else's replies is not worth the staleness — refetching is
 * one cheap GET, guarded by its own rate limit like every other public route.
 */

import { create } from 'zustand'
import { widgetApi, widgetToken, widgetErrorMessage, type WidgetMessage } from '../api/widget'
import type { LeadConsents } from '@/features/onboarding/api/guest'

export interface WidgetState {
    open: boolean
    token: string | null
    messages: WidgetMessage[]
    status: string | null
    sending: boolean
    error: string | null

    /**
     * Opens the widget. Reuses a conversation already under way — in memory,
     * or in localStorage from before a reload — instead of starting a new
     * one and losing the transcript the visitor was reading.
     */
    openWidget: () => Promise<void>
    closeWidget: () => void
    refreshMessages: () => Promise<void>
    sendMessage: (text: string) => Promise<void>
    callHuman: () => Promise<void>
    submitContact: (email: string, consents: LeadConsents) => Promise<boolean>
    clearError: () => void
}

const initialState = {
    open: false,
    token: null as string | null,
    messages: [] as WidgetMessage[],
    status: null as string | null,
    sending: false,
    error: null as string | null,
}

export const useWidgetStore = create<WidgetState>((set, get) => ({
    ...initialState,

    openWidget: async () => {
        set({ open: true, error: null })

        // In memory first: a token just minted this session need not be
        // re-read from storage. Only when neither has one does this open a
        // new conversation — the one case a stranger cannot have opened by
        // reusing a token that was never issued.
        const existing = get().token ?? widgetToken()
        if (existing) {
            set({ token: existing })
            await get().refreshMessages()
            return
        }

        try {
            const { token } = await widgetApi.start()
            set({ token, messages: [], status: null })
        } catch (err) {
            set({ error: widgetErrorMessage(err) })
        }
    },

    closeWidget: () => set({ open: false }),

    refreshMessages: async () => {
        const token = get().token
        if (!token) return
        try {
            const { messages, status } = await widgetApi.messages(token)
            set({ messages, status, error: null })
        } catch (err) {
            set({ error: widgetErrorMessage(err) })
        }
    },

    sendMessage: async (text) => {
        const token = get().token
        if (!token || get().sending) return
        const trimmed = text.trim()
        if (!trimmed) return

        set({ sending: true, error: null })
        try {
            await widgetApi.send(token, trimmed)
            await get().refreshMessages()
        } catch (err) {
            set({ error: widgetErrorMessage(err) })
        } finally {
            set({ sending: false })
        }
    },

    callHuman: async () => {
        const token = get().token
        if (!token) return
        try {
            await widgetApi.human(token)
            await get().refreshMessages()
        } catch (err) {
            set({ error: widgetErrorMessage(err) })
        }
    },

    submitContact: async (email, consents) => {
        const token = get().token
        if (!token) return false
        try {
            await widgetApi.contact(token, email, consents)
            set({ error: null })
            return true
        } catch (err) {
            set({ error: widgetErrorMessage(err) })
            return false
        }
    },

    clearError: () => set({ error: null }),
}))
