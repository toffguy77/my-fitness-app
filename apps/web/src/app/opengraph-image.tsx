import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'BURCEV — Фитнес и питание'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
    return new ImageResponse(
        (
            <div
                style={{
                    background: 'linear-gradient(135deg, #eff6ff 0%, #ffffff 50%, #ecfdf5 100%)',
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
                        color: '#111827',
                        marginBottom: 16,
                    }}
                >
                    BURCEV
                </div>
                <div
                    style={{
                        fontSize: 32,
                        color: '#4b5563',
                        textAlign: 'center',
                        maxWidth: 800,
                    }}
                >
                    Персональный трекер питания и фитнеса
                </div>
                <div
                    style={{
                        fontSize: 20,
                        color: '#9ca3af',
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
