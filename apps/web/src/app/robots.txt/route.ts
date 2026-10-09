import { robotsTxt } from './robotsTxt'

export function GET() {
    return new Response(robotsTxt(), {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
}
