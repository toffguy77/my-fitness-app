import { appleAppSiteAssociation } from './association'

// Файл без расширения, но iOS требует application/json и отказывает при
// переадресации — поэтому отдаётся маршрутом, а не из public/.
export function GET() {
    return new Response(JSON.stringify(appleAppSiteAssociation()), {
        headers: { 'Content-Type': 'application/json' },
    })
}
