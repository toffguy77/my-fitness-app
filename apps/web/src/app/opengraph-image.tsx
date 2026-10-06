import { ImageResponse } from 'next/og'
import { values } from '@burcev/design-tokens'

// Картинка рисуется вне страницы, CSS-переменных здесь нет — значения светлой темы.
const ui = values.light

export const runtime = 'edge'
export const alt = 'BURCEV — Фитнес и питание'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
    return new ImageResponse(
        (
            <div
                style={{
                    background: ui['color.bg.canvas'],
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'sans-serif',
                }}
            >
                <div
                    style={{
                        fontSize: 72,
                        fontWeight: 800,
                        color: ui['color.fg.default'],
                        marginBottom: 16,
                    }}
                >
                    BURCEV
                </div>
                <div
                    style={{
                        fontSize: 32,
                        color: ui['color.fg.muted'],
                        textAlign: 'center',
                        maxWidth: 800,
                    }}
                >
                    Personal fitness &amp; nutrition tracker
                </div>
                <div
                    style={{
                        fontSize: 20,
                        color: ui['color.primary.default'],
                        marginTop: 24,
                    }}
                >
                    burcev.team
                </div>
            </div>
        ),
        { ...size },
    )
}
