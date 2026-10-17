import { appID, appleAppSiteAssociation } from './association'

// Читается на каждый запрос: переменные окружения контейнера, а не сборки.
export const dynamic = 'force-dynamic'

// Файл без расширения, но iOS требует application/json и не следует
// переадресациям — поэтому отдаётся маршрутом, а не из public/. Без кэша:
// Apple и так держит его у себя до суток, свой кэш только продлил бы
// устаревшие пути.
export function GET() {
    const id = appID(process.env)
    if (!id) {
        return new Response('Not Found', {
            status: 404,
            headers: { 'Cache-Control': 'no-store' },
        })
    }
    return new Response(JSON.stringify(appleAppSiteAssociation(id)), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    })
}
