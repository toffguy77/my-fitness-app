import type { Metadata } from 'next'
import Link from 'next/link'
import { JsonLd } from '@/shared/components/JsonLd'
import { KbzhuCalculator } from '@/features/onboarding/components/KbzhuCalculator'

const PAGE_URL = 'https://burcev.team/kalkulyator-kbzhu'

export const metadata: Metadata = {
    title: 'Калькулятор КБЖУ онлайн — норма калорий, белков, жиров и углеводов',
    description:
        'Бесплатный калькулятор КБЖУ: дневная норма калорий, белков, жиров и углеводов для снижения веса, поддержания или набора массы. По формуле Миффлина — Сан Жеора, без регистрации.',
    alternates: { canonical: PAGE_URL },
    openGraph: {
        title: 'Калькулятор КБЖУ онлайн | BURCEV',
        description: 'Норма калорий, белков, жиров и углеводов под вашу цель — за минуту и без регистрации.',
        url: PAGE_URL,
    },
}

/*
 * The explanation describes the formula the service uses, not formulas in
 * general: every number below is a constant in
 * apps/api/internal/modules/nutrition-calc (calculator.go, types.go), and the
 * page test holds the text to them. Change one there, change it here.
 */
const SECTIONS: { title: string; paragraphs: string[] }[] = [
    {
        title: 'Как считается норма',
        paragraphs: [
            'Калькулятор использует формулу Миффлина — Сан Жеора. Она оценивает базовый обмен: энергию, которую организм тратит в покое на дыхание, кровообращение и работу органов. В формулу входят вес, рост, возраст и пол. Для мужчин к результату прибавляется 5 ккал, для женщин вычитается 161.',
        ],
    },
    {
        title: 'Учёт активности',
        paragraphs: [
            'Базовый обмен умножается на коэффициент активности: 1,2 при сидячем образе жизни, 1,375 при одной-двух тренировках в неделю, 1,55 при трёх-четырёх и 1,725 при пяти и больше. Так получается суточный расход энергии — сколько калорий вы тратите в обычный день.',
            'Выбирайте уровень по обычной неделе, а не по самой активной: завышенный коэффициент — частая причина, по которой вес стоит на месте.',
        ],
    },
    {
        title: 'Поправка на цель',
        paragraphs: [
            'Для снижения веса калорийность уменьшается на 15 %, для набора массы увеличивается на 15 %, для поддержания остаётся равной суточному расходу. Дефицит такого размера позволяет худеть без резкой потери сил, а такой же профицит даёт прирост без лишнего жира.',
        ],
    },
    {
        title: 'Белки, жиры и углеводы',
        paragraphs: [
            'Белок считается от веса тела: 1,8 г на килограмм при снижении веса, 1,6 г при поддержании и 2 г при наборе массы. Он сохраняет мышцы на дефиците и помогает строить их на профиците. На жиры приходится 25 % калорийности — они нужны для гормонов и усвоения витаминов. Оставшиеся калории отдаются углеводам, основному топливу для тренировок.',
        ],
    },
    {
        // 10 × 65 + 6,25 × 168 − 5 × 30 − 161 = 1389; × 1,55 = 2153; × 0,85 = 1830;
        // белок 1,8 × 65 = 117 г, жиры 1830 × 0,25 / 9 ≈ 51 г, углеводы ≈ 226 г.
        title: 'Пример расчёта',
        paragraphs: [
            'Женщина 30 лет, рост 168 см, вес 65 кг, три тренировки в неделю, цель — снизить вес. Базовый обмен: 10 × 65 + 6,25 × 168 − 5 × 30 − 161 = 1389 ккал. С коэффициентом 1,55 суточный расход составит около 2153 ккал, а с дефицитом 15 % норма — около 1830 ккал: белков 117 г, жиров 51 г, углеводов 226 г.',
        ],
    },
    {
        title: 'Что делать с результатом',
        paragraphs: [
            'Норма — отправная точка, а не приговор. Записывайте еду в дневник две-три недели и следите за весом. Если он меняется не так, как вы ожидали, норму стоит поправить: формула описывает среднего человека, а обмен веществ у всех немного разный. Удобнее всего делать это вместе с куратором — он смотрит на ваш дневник и динамику веса и раз в неделю корректирует план.',
        ],
    },
]

const FAQ: { question: string; answer: string }[] = [
    {
        question: 'Какая формула точнее всего считает калории?',
        answer: 'Формула Миффлина — Сан Жеора считается самой точной из простых формул для взрослых. Погрешность для конкретного человека всё равно возможна, поэтому норму проверяют по изменению веса за две-три недели.',
    },
    {
        question: 'Нужно ли отдельно считать калории тренировок?',
        answer: 'Нет, если уровень активности выбран честно: регулярные тренировки уже учтены коэффициентом. В приложении BURCEV можно отметить конкретную тренировку, и норма на этот день увеличится.',
    },
    {
        question: 'Сколько белка нужно в день?',
        answer: 'От 1,6 до 2 г на килограмм веса в зависимости от цели: больше при наборе массы и при снижении веса, меньше при поддержании.',
    },
    {
        question: 'Подходит ли калькулятор при беременности или заболеваниях?',
        answer: 'Нет. Во время беременности и кормления грудью, при заболеваниях обмена веществ и для подростков нормы считаются иначе — их подбирает врач.',
    },
    {
        question: 'Это бесплатно?',
        answer: 'Да. Расчёт нормы, дневник питания, вес и вода бесплатны и не требуют оплаты. Платная только работа с куратором.',
    },
]

export default function CalculatorPage() {
    const faqJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: FAQ.map(({ question, answer }) => ({
            '@type': 'Question',
            name: question,
            acceptedAnswer: { '@type': 'Answer', text: answer },
        })),
    }

    return (
        <main className="mx-auto max-w-3xl px-4 py-8">
            <JsonLd data={faqJsonLd} />

            <h1 className="text-3xl font-bold text-gray-900">Калькулятор КБЖУ онлайн</h1>
            <p className="mt-3 text-gray-600">
                Рассчитайте дневную норму калорий, белков, жиров и углеводов под свою цель —
                снижение веса, поддержание или набор массы. Расчёт бесплатный и не требует
                регистрации.
            </p>

            <div className="mt-8">
                <KbzhuCalculator />
            </div>

            <article data-testid="calculator-explained" className="mt-12 space-y-8 text-gray-800">
                {SECTIONS.map((section) => (
                    <section key={section.title}>
                        <h2 className="text-xl font-semibold text-gray-900">{section.title}</h2>
                        {section.paragraphs.map((paragraph) => (
                            <p key={paragraph} className="mt-3 leading-relaxed">
                                {paragraph}
                            </p>
                        ))}
                    </section>
                ))}
            </article>

            <section data-testid="calculator-faq" className="mt-12">
                <h2 className="text-xl font-semibold text-gray-900">Вопросы и ответы</h2>
                <div className="mt-4 divide-y divide-gray-200 rounded-xl border border-gray-200 bg-white">
                    {FAQ.map(({ question, answer }) => (
                        <details key={question} className="group p-4">
                            <summary className="cursor-pointer font-medium text-gray-900">{question}</summary>
                            <p className="mt-2 text-gray-700">{answer}</p>
                        </details>
                    ))}
                </div>
            </section>

            <p className="mt-10 text-sm text-gray-600">
                Хотите, чтобы норму вели и поправляли за вас?{' '}
                <Link href="/pricing" className="font-medium text-blue-700 hover:underline">
                    Посмотрите тарифы
                </Link>
                {' · '}
                <Link href="/content" className="font-medium text-blue-700 hover:underline">
                    Статьи о питании
                </Link>
            </p>
        </main>
    )
}
