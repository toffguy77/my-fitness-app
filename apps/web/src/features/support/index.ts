/**
 * Support widget feature public API.
 *
 * The bot conversation a landing-page visitor can have before registering.
 */

// Types
export type { WidgetMessage, WidgetMessagesResult, WidgetStartResult } from './api/widget'

// API
export { widgetApi, widgetToken, widgetErrorMessage, WIDGET_TOKEN_KEY } from './api/widget'

// Store
export { useWidgetStore } from './store/widgetStore'
export type { WidgetState } from './store/widgetStore'
