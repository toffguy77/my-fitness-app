export function validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
}

export function validatePassword(password: string, minLength: number = 8): boolean {
    return password.length >= minLength
}

export function validateRequired(value: string): boolean {
    return value.trim().length > 0
}
