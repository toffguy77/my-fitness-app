const { TextEncoder, TextDecoder } = require('util')
const { TransformStream, ReadableStream, WritableStream } = require('stream/web')

// Polyfill Web APIs
global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder
global.TransformStream = TransformStream
global.ReadableStream = ReadableStream
global.WritableStream = WritableStream
