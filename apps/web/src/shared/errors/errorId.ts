/**
 * Short, human-dictatable identifier shown on error screens and attached to the
 * log entry sent to the server.
 *
 * A user reads this aloud to support, so it avoids characters that sound or
 * look alike (0/O, 1/I/l) and stays short. A UUID would be unusable for that.
 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const LENGTH = 8

export function generateErrorId(): string {
    const bytes = new Uint8Array(LENGTH)

    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        crypto.getRandomValues(bytes)
    } else {
        for (let i = 0; i < LENGTH; i++) bytes[i] = Math.floor(Math.random() * 256)
    }

    let id = ''
    for (let i = 0; i < LENGTH; i++) id += ALPHABET[bytes[i] % ALPHABET.length]
    return `${id.slice(0, 4)}-${id.slice(4)}`
}
