const { TextEncoder, TextDecoder } = require('util')
const { TransformStream } = require('stream/web')

// Polyfill Web APIs
global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder
global.TransformStream = TransformStream
