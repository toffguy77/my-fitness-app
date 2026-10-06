/**
 * Компоненты дизайн-системы: поведение, которое легко сломать незаметно —
 * доли, превышения, отсутствие нормы, подписи для экранного диктора.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { color } from '@burcev/design-tokens'
import { Button, IconButton } from '../Button'
import { Card } from '../Card'
import { ProgressBar } from '../ProgressBar'
import { ProgressArc } from '../ProgressArc'
import { MacroRemaining } from '../MacroRemaining'
import { WeekDots, weekSummary, isInside, type WeekDotsDay } from '../WeekDots'
import { QuickAddActions, QuickAddBar } from '../QuickAdd'

describe('Button', () => {
    it('по умолчанию — главное действие брендом', () => {
        render(<Button>Записать</Button>)
        expect(screen.getByRole('button', { name: 'Записать' })).toHaveClass('bg-primary', 'text-on-primary', 'rounded-full')
    })

    it('в состоянии загрузки недоступна и сообщает о занятости', () => {
        render(<Button isLoading>Сохранить</Button>)
        const button = screen.getByRole('button', { name: 'Сохранить' })
        expect(button).toBeDisabled()
        expect(button).toHaveAttribute('aria-busy', 'true')
    })

    it('outline — то же, что secondary', () => {
        render(<><Button variant="outline">A</Button><Button variant="secondary">B</Button></>)
        expect(screen.getByRole('button', { name: 'A' }).className).toBe(screen.getByRole('button', { name: 'B' }).className)
    })

    it('IconButton — круглая цель не меньше 44 px с подписью', () => {
        render(<IconButton aria-label="Закрыть">×</IconButton>)
        expect(screen.getByRole('button', { name: 'Закрыть' })).toHaveClass('h-11', 'w-11', 'rounded-full')
    })
})

describe('Card', () => {
    it('coach — тёмная плашка куратора', () => {
        const { container } = render(<Card variant="coach">Текст</Card>)
        expect(container.firstChild).toHaveClass('bg-coach', 'text-on-coach', 'rounded-card')
    })
})

describe('ProgressBar', () => {
    it('не заполняется больше чем на 100% и не красится оценкой', () => {
        render(<ProgressBar value={300} max={200} color={color.protein} label="Белки" />)
        const bar = screen.getByRole('progressbar', { name: 'Белки' })
        const fill = bar.firstElementChild as HTMLElement
        expect(fill.style.width).toBe('100%')
        expect(fill.style.backgroundColor).toBe(color.protein)
        expect(bar).toHaveAttribute('aria-valuenow', '300')
    })

    it('без подписи — украшение, скрытое от диктора', () => {
        const { container } = render(<ProgressBar value={1} max={2} color={color.fat} />)
        expect(container.firstChild).toHaveAttribute('aria-hidden', 'true')
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    })

    it('нулевая норма — пустая полоса, а не деление на ноль', () => {
        const { container } = render(<ProgressBar value={10} max={0} color={color.fat} />)
        expect(((container.firstChild as HTMLElement).firstElementChild as HTMLElement).style.width).toBe('0%')
    })
})

describe('ProgressArc', () => {
    it('заполняет дугу долей и называет её', () => {
        const { container } = render(<ProgressArc value={1206} max={2150} label="Калории">944</ProgressArc>)
        expect(screen.getByRole('img', { name: 'Калории' })).toHaveTextContent('944')
        const fill = container.querySelectorAll('path')[1]
        expect(Number(fill.getAttribute('stroke-dasharray')!.split(' ')[0])).toBeCloseTo(56.09, 1)
    })

    it('при нуле рисует только дорожку', () => {
        const { container } = render(<ProgressArc value={0} max={2000} label="Калории" />)
        expect(container.querySelectorAll('path')).toHaveLength(1)
    })
})

describe('MacroRemaining', () => {
    const eaten = { protein: 91, fat: 43, carbs: 112 }
    const goal = { protein: 140, fat: 70, carbs: 240 }

    it('главное число — остаток в граммах', () => {
        render(<MacroRemaining eaten={eaten} goal={goal} />)
        expect(screen.getByTestId('macro-remaining-protein')).toHaveTextContent('49г')
        expect(screen.getByTestId('macro-remaining-fat')).toHaveTextContent('27г')
        expect(screen.getByTestId('macro-remaining-carbs')).toHaveTextContent('128г')
        expect(screen.getByRole('progressbar', { name: 'Белки: осталось 49 г, съедено 91 из 140 г' })).toBeInTheDocument()
    })

    it('плитки — каждая колонка своей карточкой', () => {
        render(<MacroRemaining eaten={eaten} goal={goal} variant="tiles" />)
        expect(screen.getByTestId('macro-remaining-fat')).toHaveClass('rounded-tile', 'bg-surface')
    })

    it('превышение — плюсом и словом, без минуса', () => {
        render(<MacroRemaining eaten={{ ...eaten, fat: 80 }} goal={goal} />)
        const fat = screen.getByTestId('macro-remaining-fat')
        expect(fat).toHaveTextContent('+10г')
        expect(fat).toHaveTextContent('сверх нормы')
        expect(screen.getByRole('progressbar', { name: /Жиры: сверх нормы на 10 г/ })).toBeInTheDocument()
    })

    it('без нормы — съеденное, без полосы', () => {
        render(<MacroRemaining eaten={eaten} goal={{ fat: 70 }} />)
        expect(screen.getByTestId('macro-remaining-protein')).toHaveTextContent('91г')
        expect(screen.getByTestId('macro-remaining-protein')).toHaveTextContent('съедено')
        expect(screen.getAllByRole('progressbar')).toHaveLength(1)
        expect(screen.getByText('Белки: съедено 91 г, норма не задана')).toBeInTheDocument()
    })
})

describe('WeekDots', () => {
    const days: WeekDotsDay[] = [
        { date: '2026-09-22', label: 'Вт', deviation: -0.02 },
        { date: '2026-09-23', label: 'Ср', deviation: 0.04 },
        { date: '2026-09-24', label: 'Чт', deviation: -0.12 },
        { date: '2026-09-25', label: 'Пт', deviation: null },
        { date: '2026-09-26', label: 'Сб', deviation: 0.18 },
        { date: '2026-09-27', label: 'Вс', deviation: -0.04 },
        { date: '2026-09-28', label: 'Пн', deviation: -0.44, isToday: true },
    ]

    it('считает завершённые дни с данными: в коридоре из всех', () => {
        expect(weekSummary(days)).toEqual({ inside: 3, total: 5 })
    })

    it('сегодняшний день не оценивается — он ещё идёт', () => {
        expect(isInside({ date: 'x', label: 'Пн', deviation: 0, isToday: true })).toBe(false)
    })

    it('называет каждый день словами', () => {
        render(<WeekDots days={days} />)
        expect(screen.getByLabelText('Вт: в пределах нормы')).toBeInTheDocument()
        expect(screen.getByLabelText('Сб: выше нормы на 18%')).toBeInTheDocument()
        expect(screen.getByLabelText('Чт: ниже нормы на 12%')).toBeInTheDocument()
        expect(screen.getByLabelText('Пт: нет данных')).toBeInTheDocument()
        expect(screen.getByLabelText('Пн: сегодня, день ещё идёт')).toBeInTheDocument()
    })

    it('точки мимо нормы отличаются от точек в норме', () => {
        const { container } = render(<WeekDots days={days} />)
        expect(container.querySelectorAll('[data-inside="true"].bg-fg')).toHaveLength(3)
        expect(container.querySelectorAll('[data-inside="false"].bg-warning')).toHaveLength(2)
    })

    it('выше нормы — выше полосы, ниже — ниже', () => {
        const { container } = render(<WeekDots days={days} />)
        const top = (label: string) => parseFloat(
            (screen.getByLabelText(new RegExp(`^${label}:`)).querySelector('[data-inside]') as HTMLElement).style.top,
        )
        expect(top('Сб')).toBeLessThan(top('Вт'))
        expect(top('Чт')).toBeGreaterThan(top('Вт'))
        expect(container).toBeTruthy()
    })
})

describe('QuickAdd', () => {
    it('карточка: главное — поиск, рядом фото и штрихкод', async () => {
        const onSelect = jest.fn()
        render(<QuickAddActions onSelect={onSelect} />)
        await userEvent.click(screen.getByRole('button', { name: 'Записать еду' }))
        await userEvent.click(screen.getByRole('button', { name: 'Распознать еду по фото' }))
        await userEvent.click(screen.getByRole('button', { name: 'Сканировать штрихкод' }))
        expect(onSelect.mock.calls.map((c) => c[0])).toEqual(['search', 'photo', 'barcode'])
    })

    it('панель: три способа, фото — основной', async () => {
        const onSelect = jest.fn()
        render(<QuickAddBar onSelect={onSelect} />)
        expect(screen.getByRole('group', { name: 'Быстрая запись еды' })).toHaveClass('bg-coach')
        expect(screen.getByRole('button', { name: 'Распознать еду по фото' })).toHaveClass('bg-primary')
        await userEvent.click(screen.getByRole('button', { name: 'Найти продукт' }))
        expect(onSelect).toHaveBeenCalledWith('search')
    })

    it('во время перехода не нажимается второй раз', () => {
        render(<QuickAddActions onSelect={jest.fn()} pending />)
        screen.getAllByRole('button').forEach((b) => expect(b).toBeDisabled())
    })
})
