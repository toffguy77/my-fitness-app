/**
 * Кураторский раздел: причина отказа доезжает до куратора.
 *
 * Куратор заполняет форму на чужого клиента. Отказ «не удалось сохранить план»
 * не говорит, что делать дальше; «нет доступа» и «действие невозможно в текущем
 * состоянии» говорят — и это ровно то, что сервер и прислал.
 *
 * Отдельно про удаление: раньше два места ловили ошибку и не делали ничего
 * («silently fail»). Куратор жал «удалить», строка оставалась на месте, и
 * экран молчал о том, почему.
 *
 * «Очередь поддержки» и «Заявки» переехали сюда вместе с SupportQueue и
 * LeadList: заявки и поддержка теперь кураторские, а не админские экраны.
 * Остальные сценарии этих компонентов (пустая очередь, порядок карточек,
 * успешные сценарии) уже разобраны в SupportQueue.test.tsx и LeadList.test.tsx
 * рядом — здесь только причины отказа, которых там не было.
 */
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/shared/errors/apiErrors'

jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: jest.fn() }),
    usePathname: () => '/curator/clients/1',
    useSearchParams: () => new URLSearchParams(),
}))

const mockSubmitFeedback = jest.fn()
const mockCreateWeeklyPlan = jest.fn()
const mockGetWeeklyPlans = jest.fn()
const mockDeleteWeeklyPlan = jest.fn()
const mockCreateTask = jest.fn()
const mockGetTasks = jest.fn()
const mockDeleteTask = jest.fn()
const mockGetSupportConversations = jest.fn()
const mockGetSupportThread = jest.fn()
const mockReplyToSupport = jest.fn()
const mockCloseSupport = jest.fn()
const mockGetLeads = jest.fn()

jest.mock('@/features/curator/api/curatorApi', () => ({
    curatorApi: {
        submitFeedback: (...args: unknown[]) => mockSubmitFeedback(...args),
        createWeeklyPlan: (...args: unknown[]) => mockCreateWeeklyPlan(...args),
        updateWeeklyPlan: jest.fn(),
        getWeeklyPlans: (...args: unknown[]) => mockGetWeeklyPlans(...args),
        deleteWeeklyPlan: (...args: unknown[]) => mockDeleteWeeklyPlan(...args),
        createTask: (...args: unknown[]) => mockCreateTask(...args),
        updateTask: jest.fn(),
        getTasks: (...args: unknown[]) => mockGetTasks(...args),
        deleteTask: (...args: unknown[]) => mockDeleteTask(...args),
        getSupportConversations: (...args: unknown[]) => mockGetSupportConversations(...args),
        getSupportThread: (...args: unknown[]) => mockGetSupportThread(...args),
        replyToSupport: (...args: unknown[]) => mockReplyToSupport(...args),
        closeSupport: (...args: unknown[]) => mockCloseSupport(...args),
        getLeads: (...args: unknown[]) => mockGetLeads(...args),
        markLeadHandled: jest.fn(),
    },
}))

jest.mock('react-hot-toast', () => ({
    __esModule: true,
    default: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }),
}))

import toast from 'react-hot-toast'
import { FeedbackForm } from '../FeedbackForm'
import { PlanForm } from '../PlanForm'
import { TaskForm } from '../TaskForm'
import { PlanTab } from '../PlanTab'
import { TasksTab } from '../TasksTab'
import { SupportQueue } from '../SupportQueue'
import { LeadList } from '../LeadList'
import type { TaskView, WeeklyPlanView } from '../../types'

/** Отказ, который сервер объяснил кодом. */
function refusal(status: number, code: string) {
    return new ApiError(status, { code, message: 'серверная проза' })
}

const WAIT = { timeout: 1500 }

const plan: WeeklyPlanView = {
    id: 'p1',
    calories: 2000,
    protein: 150,
    fat: 70,
    carbs: 250,
    start_date: '2026-03-09',
    end_date: '2026-03-15',
    is_active: true,
    created_at: '2026-03-09T00:00:00Z',
}

const task: TaskView = {
    id: 't1',
    title: 'Выпить 8 стаканов воды',
    type: 'habit',
    deadline: '2026-03-15',
    recurrence: 'daily',
    status: 'active',
    completions: [],
    created_at: '2026-03-01T00:00:00Z',
}

beforeEach(() => {
    jest.clearAllMocks()
})

describe('Обратная связь по отчёту', () => {
    it('показывает причину, по которой отзыв не сохранился', async () => {
        mockSubmitFeedback.mockRejectedValue(refusal(403, 'forbidden'))

        render(<FeedbackForm clientId={42} reportId="r-123" onClose={jest.fn()} onSaved={jest.fn()} />)
        await userEvent.type(screen.getByPlaceholderText('Общий итог по неделе'), 'Неделя хорошая')
        await userEvent.click(screen.getByRole('button', { name: /Отправить обратную связь/ }))

        expect(await screen.findByText('Нет доступа')).toBeInTheDocument()
    })
})

describe('Недельный план', () => {
    it('показывает причину, по которой план не сохранился', async () => {
        mockCreateWeeklyPlan.mockRejectedValue(refusal(409, 'conflict'))

        render(<PlanForm clientId={1} onClose={jest.fn()} onSaved={jest.fn()} />)
        const inputs = screen.getAllByRole('spinbutton')
        await userEvent.type(inputs[0], '1800')
        await userEvent.type(inputs[1], '130')
        await userEvent.type(inputs[2], '60')
        await userEvent.type(inputs[3], '220')
        await userEvent.click(screen.getByRole('button', { name: /создать план/i }))

        expect(await screen.findByText('Действие невозможно в текущем состоянии')).toBeInTheDocument()
    })

    it('показывает причину, по которой планы не загрузились', async () => {
        mockGetWeeklyPlans.mockRejectedValue(refusal(403, 'forbidden'))

        render(<PlanTab clientId={1} />)

        expect(await screen.findByText('Нет доступа')).toBeInTheDocument()
    })

    // Раньше здесь был пустой catch с комментарием «silently fail»: план
    // оставался на экране, и куратор не знал, удалён он или нет.
    it('не молчит, когда план не удалился', async () => {
        mockGetWeeklyPlans.mockResolvedValue([plan])
        mockDeleteWeeklyPlan.mockRejectedValue(refusal(409, 'gone'))

        render(<PlanTab clientId={1} />)
        await userEvent.click(await screen.findByRole('button', { name: 'Удалить план' }))
        // Удаление спрашивает подтверждение своим диалогом.
        await userEvent.click(
            within(await screen.findByRole('dialog')).getByRole('button', { name: 'Удалить' }),
        )

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Больше недоступно'), WAIT)
        // План остался на экране — и теперь понятно почему.
        expect(screen.getByText('Текущий план')).toBeInTheDocument()
    })
})

describe('Задачи', () => {
    it('показывает причину, по которой задача не создалась', async () => {
        mockCreateTask.mockRejectedValue(refusal(400, 'validation'))

        render(<TaskForm clientId={42} onClose={jest.fn()} onSaved={jest.fn()} />)
        await userEvent.type(screen.getByPlaceholderText('Что нужно сделать?'), 'Сделать замеры')
        fireEvent.change(
            screen.getByText('Дедлайн', { selector: 'label' }).parentElement!.querySelector('input[type="date"]')!,
            { target: { value: '2026-03-20' } }
        )
        fireEvent.submit(document.querySelector('form')!)

        expect(await screen.findByText('Проверьте введённые данные')).toBeInTheDocument()
    })

    it('показывает причину, по которой задачи не загрузились', async () => {
        mockGetTasks.mockRejectedValue(refusal(403, 'forbidden'))

        render(<TasksTab clientId={1} />)

        expect(await screen.findByText('Нет доступа')).toBeInTheDocument()
    })

    it('не молчит, когда задача не удалилась', async () => {
        mockGetTasks.mockResolvedValue([task])
        mockDeleteTask.mockRejectedValue(refusal(403, 'forbidden'))

        render(<TasksTab clientId={1} />)
        await screen.findByText('Выпить 8 стаканов воды')
        await userEvent.click(screen.getByRole('button', { name: 'Удалить задачу' }))

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Нет доступа'), WAIT)
        expect(screen.getByText('Выпить 8 стаканов воды')).toBeInTheDocument()
    })
})

describe('Очередь поддержки', () => {
    function queueWith(items: unknown[]) {
        mockGetSupportConversations.mockResolvedValue({
            items, total: items.length, limit: 20, offset: 0,
        })
    }

    const conversation = {
        id: 'conv-1',
        chat_id: 555,
        status: 'escalated',
        telegram_name: 'Гость',
        escalation_reason: 'ответа нет в документации',
        last_message_at: '2026-03-01T10:00:00Z',
        created_at: '2026-03-01T09:00:00Z',
    }

    it('показывает причину, по которой очередь не загрузилась', async () => {
        mockGetSupportConversations.mockRejectedValue(refusal(403, 'forbidden'))

        render(<SupportQueue />)

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Нет доступа'), WAIT)
    })

    it('показывает причину, по которой переписка не открылась', async () => {
        queueWith([conversation])
        mockGetSupportThread.mockRejectedValue(refusal(404, 'not_found'))

        render(<SupportQueue />)
        await userEvent.click(await screen.findByTestId('support-conversation'))

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Не найдено'), WAIT)
    })

    it('показывает причину, по которой ответ не ушёл', async () => {
        queueWith([conversation])
        mockGetSupportThread.mockResolvedValue({ conversation, messages: [] })
        mockReplyToSupport.mockRejectedValue(refusal(503, 'feature_unavailable'))

        render(<SupportQueue />)
        await userEvent.click(await screen.findByTestId('support-conversation'))
        await userEvent.type(await screen.findByLabelText('Ответ'), 'Куратор входит в подписку')
        await userEvent.click(screen.getByRole('button', { name: 'Отправить в Telegram' }))

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Возможность отключена в этой среде'), WAIT)
    })

    it('показывает причину, по которой переписку не закрыли', async () => {
        queueWith([conversation])
        mockGetSupportThread.mockResolvedValue({ conversation, messages: [] })
        mockCloseSupport.mockRejectedValue(refusal(409, 'conflict'))

        render(<SupportQueue />)
        await userEvent.click(await screen.findByTestId('support-conversation'))
        await userEvent.click(screen.getByRole('button', { name: 'Закрыть обращение' }))

        await waitFor(
            () => expect(toast.error).toHaveBeenCalledWith('Действие невозможно в текущем состоянии'),
            WAIT
        )
    })
})

describe('Заявки', () => {
    // markLeadHandled уже проверен в LeadList.test.tsx («сообщает, что заявку
    // уже взяли») — там код именно тот, что реально приходит от сервера
    // (lead_already_claimed), и тест там же убеждается, что это не общий
    // fallback. Дублировать его здесь с кодом conflict незачем: catch один и
    // тот же. Не хватало только причины отказа при самой загрузке очереди.
    it('показывает причину, по которой заявки не загрузились', async () => {
        mockGetLeads.mockRejectedValue(refusal(403, 'forbidden'))

        render(<LeadList />)

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Нет доступа'), WAIT)
    })
})
