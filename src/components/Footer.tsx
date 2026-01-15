'use client'

// Get version from environment variable (set in next.config.ts)
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || '0.0.0'

export default function Footer() {
  return (
    <footer className="bg-zinc-950 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <div className="text-sm text-zinc-400">
            © {new Date().getFullYear()} BURCEV. Все права защищены.
            <span className="ml-2 text-zinc-500">v{APP_VERSION}</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
