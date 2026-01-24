/**
 * MSW Server Setup for Node.js (Jest tests)
 */

import { setupServer } from 'msw/node'
import { handlers } from './handlers'

export const server = setupServer(...handlers)
