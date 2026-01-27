import { Logo } from '@/shared/components/ui'

export default function Home() {
    return (
        <main className="flex min-h-screen flex-col items-center justify-center p-24">
            <div className="text-center space-y-6">
                <div className="flex justify-center">
                    <Logo width={240} height={72} className="text-gray-900" />
                </div>
                <div className="space-y-2">
                    <h1 className="text-4xl font-bold">Development Environment</h1>
                    <p className="text-xl text-gray-600">
                        Ready for development
                    </p>
                </div>
            </div>
        </main>
    )
}
