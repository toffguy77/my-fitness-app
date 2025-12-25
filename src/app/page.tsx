// Лендинг страница (публичная) - Absolute Style
'use client'

import { ArrowRight } from 'lucide-react'
import Link from 'next/link'

export default function LandingPage() {

  return (
    <main className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="w-full max-w-4xl mx-auto px-4 sm:px-6 py-16 sm:py-32 text-center">
        <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black text-black mb-6 sm:mb-8 leading-tight">
          Твое тело — это математика, а не магия.
        </h1>
        <p className="text-lg sm:text-xl md:text-2xl text-gray-700 mb-8 sm:mb-12 max-w-3xl mx-auto leading-relaxed px-4">
          Перестань надеяться на интуицию. Интуиция привела тебя к тому весу, который есть сейчас.
          Чтобы изменить результат, нужно изменить данные.
        </p>
        <div className="flex flex-col items-center gap-4">
          <Link
            href="/register"
            className="px-12 py-5 bg-black text-white rounded-none font-bold text-lg hover:bg-gray-900 transition-colors inline-flex items-center gap-2"
          >
            Начать бесплатно
            <ArrowRight size={20} />
          </Link>
          <p className="text-sm text-gray-500 mt-2">
            Никакой рекламы. Никаких геймификаций. Только цифры.
          </p>
        </div>
      </section>

      {/* The Problem */}
      <section className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-24 bg-gray-50">
        <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-black mb-8 sm:mb-16 text-center px-4">
          Почему ты срываешься?
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 sm:gap-8 md:gap-12">
          <div className="bg-white p-8 border-2 border-black">
            <h3 className="text-2xl font-bold text-black mb-4">Иллюзия контроля</h3>
            <p className="text-gray-700 leading-relaxed">
              Ты думаешь, что ешь мало, но не считаешь перекусы и &quot;жидкие калории&quot;.
              Без жесткого учета ты слеп.
            </p>
          </div>

          <div className="bg-white p-8 border-2 border-black">
            <h3 className="text-2xl font-bold text-black mb-4">Эмоциональный шум</h3>
            <p className="text-gray-700 leading-relaxed">
              Обычные приложения хвалят тебя за съеденное яблоко. Нам все равно.
              Нам важен только сухой остаток: БЖУ и дефицит.
            </p>
          </div>

          <div className="bg-white p-8 border-2 border-black">
            <h3 className="text-2xl font-bold text-black mb-4">Одиночество</h3>
            <p className="text-gray-700 leading-relaxed">
              Ты один на один с цифрами. Когда мотивация падает,
              никто не скажет, что делать дальше.
            </p>
          </div>
        </div>
      </section>

      {/* The Solution */}
      <section className="w-full max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-24">
        <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-black mb-8 sm:mb-16 text-center px-4">
          Система управления пищевым поведением.
        </h2>
        <div className="space-y-8">
          <div className="flex items-start gap-6">
            <div className="w-2 h-2 bg-black rounded-full mt-3 flex-shrink-0"></div>
            <div>
              <h3 className="text-2xl font-bold text-black mb-2">Быстрый ввод.</h3>
              <p className="text-lg text-gray-700 leading-relaxed">
                Только суть: Белки, Жиры, Углеводы, Калории.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-6">
            <div className="w-2 h-2 bg-black rounded-full mt-3 flex-shrink-0"></div>
            <div>
              <h3 className="text-2xl font-bold text-black mb-2">Субъективные метрики.</h3>
              <p className="text-lg text-gray-700 leading-relaxed">
                Мы фиксируем не только еду, но и уровень голода.
                Это ключ к пониманию твоего организма.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-6">
            <div className="w-2 h-2 bg-black rounded-full mt-3 flex-shrink-0"></div>
            <div>
              <h3 className="text-2xl font-bold text-black mb-2">Фокус на главном.</h3>
              <p className="text-lg text-gray-700 leading-relaxed">
                Ты видишь только то, что влияет на вес: план против факта.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* The Hook */}
      <section className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-24 bg-black text-white">
        <h2 className="text-3xl sm:text-4xl md:text-5xl font-black mb-6 sm:mb-8 text-center px-4">
          Начни один. Продолжи с профессионалом.
        </h2>
        <p className="text-lg sm:text-xl text-gray-300 mb-8 sm:mb-16 text-center max-w-3xl mx-auto leading-relaxed px-4">
          Используй приложение как бесплатный дневник столько, сколько нужно.
          Когда поймешь, что уперся в потолок — активируй режим работы с координатором.
        </p>

        {/* Comparison Table */}
        <div className="bg-white text-black border-2 border-white">
          <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-black">
            {/* Free Column */}
            <div className="p-8">
              <h3 className="text-2xl font-black mb-6">Free<br />(Самостоятельно)</h3>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <span className="text-black mt-1">•</span>
                  <span className="text-gray-700">Дневник питания и веса</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-black mt-1">•</span>
                  <span className="text-gray-700">Базовая статистика</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-black mt-1">•</span>
                  <span className="text-gray-700">Самоконтроль</span>
                </li>
                <li className="flex items-start gap-3 mt-6 pt-6 border-t-2 border-black">
                  <span className="text-black font-bold text-xl">Бесплатно навсегда</span>
                </li>
              </ul>
            </div>

            {/* Pro Column */}
            <div className="p-8 bg-gray-50">
              <h3 className="text-2xl font-black mb-6">Pro<br />(С координатором)</h3>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <span className="text-black mt-1">•</span>
                  <span className="text-gray-700">Анализ отчетов и коррекция ошибок</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-black mt-1">•</span>
                  <span className="text-gray-700">Персональные цели (КБЖУ) под тебя</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-black mt-1">•</span>
                  <span className="text-gray-700">Ответы на вопросы и стратегия</span>
                </li>
                <li className="flex items-start gap-3 mt-6 pt-6 border-t-2 border-black">
                  <span className="text-black font-bold text-xl">По запросу</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="w-full max-w-4xl mx-auto px-4 sm:px-6 py-16 sm:py-32 text-center">
        <p className="text-2xl sm:text-3xl md:text-4xl font-bold text-black mb-8 sm:mb-12 leading-relaxed px-4">
          Хаос нельзя улучшить. Его можно только упорядочить.<br />
          Сделай первый шаг к системе.
        </p>
        <Link
          href="/register"
          className="inline-flex items-center gap-2 px-12 py-5 bg-black text-white rounded-none font-bold text-lg hover:bg-gray-900 transition-colors"
        >
          Регистрация
          <ArrowRight size={20} />
        </Link>
      </section>

      {/* Footer */}
      <footer className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12 border-t-2 border-black">
        <div className="text-center text-sm text-gray-500">
          <p>© 2025 BURCEV. Все права защищены.</p>
        </div>
      </footer>
    </main>
  )
}
