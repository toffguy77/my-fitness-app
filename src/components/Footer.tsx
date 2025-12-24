'use client'

export default function Footer() {

  return (
    <footer className="bg-white border-t border-gray-200 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-sm text-gray-600">
            © {new Date().getFullYear()} Fitness App. Все права защищены.
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-600">
            <a href="/app/settings" className="hover:text-gray-900 transition-colors">
              Настройки
            </a>
            <span className="text-gray-300">|</span>
            <a href="/leaderboard" className="hover:text-gray-900 transition-colors">
              Лидерборд
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}

