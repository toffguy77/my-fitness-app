import { ScanBarcode as Barcode, Camera, Plus, Search } from 'lucide-react'
import { cn } from '@/shared/utils/cn'
import { t } from '@/shared/i18n'
import { buttonBase, buttonSizes, buttonVariants, IconButton } from './Button'

/** Способ записи еды. Совпадает с `?add=` дневника питания. */
export type QuickAddMethod = 'search' | 'barcode' | 'photo'

export interface QuickAddProps {
    onSelect: (method: QuickAddMethod) => void
    /** Идёт переход: кнопки не нажимаются второй раз. */
    pending?: boolean
    className?: string
}

/**
 * Запись еды в одно касание прямо с карточки питания на дашборде:
 * главная кнопка — поиск (ручной ввод), рядом фото и штрихкод.
 * Человек попадает сразу в нужный способ, а не на дневник, откуда его ещё
 * нужно выбрать.
 */
export function QuickAddActions({ onSelect, pending, className }: QuickAddProps) {
    return (
        <div role="group" aria-label={t('ui.quickAdd.groupAria')} className={cn('flex gap-2', className)}>
            <button
                type="button"
                onClick={() => onSelect('search')}
                disabled={pending}
                className={cn(buttonBase, buttonVariants.primary, buttonSizes.lg, 'flex-1')}
            >
                <Plus className="h-[18px] w-[18px]" strokeWidth={2.2} aria-hidden="true" />
                {t('ui.quickAdd.log')}
            </button>
            <IconButton size="lg" aria-label={t('ui.quickAdd.photoAria')} onClick={() => onSelect('photo')} disabled={pending}>
                <Camera className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
            </IconButton>
            <IconButton size="lg" aria-label={t('ui.quickAdd.barcodeAria')} onClick={() => onSelect('barcode')} disabled={pending}>
                <Barcode className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
            </IconButton>
        </div>
    )
}

const SEGMENTS: { method: QuickAddMethod; icon: typeof Search; label: string; aria: string }[] = [
    { method: 'search', icon: Search, label: 'ui.quickAdd.search', aria: 'ui.quickAdd.searchAria' },
    { method: 'barcode', icon: Barcode, label: 'ui.quickAdd.barcode', aria: 'ui.quickAdd.barcodeAria' },
    { method: 'photo', icon: Camera, label: 'ui.quickAdd.photo', aria: 'ui.quickAdd.photoAria' },
]

/**
 * Плавающая панель быстрого ввода над нижней навигацией дневника.
 * Фото — основное действие (распознавание быстрее всего), поиск и код — рядом.
 * Положение задаёт родитель: панель знает только свою форму.
 */
export function QuickAddBar({ onSelect, pending, className }: QuickAddProps) {
    return (
        <div
            role="group"
            aria-label={t('ui.quickAdd.groupAria')}
            className={cn('grid grid-cols-3 gap-1 rounded-full bg-coach p-1.5 shadow-float', className)}
        >
            {SEGMENTS.map(({ method, icon: Icon, label, aria }) => (
                <button
                    key={method}
                    type="button"
                    aria-label={t(aria)}
                    disabled={pending}
                    onClick={() => onSelect(method)}
                    className={cn(
                        'flex h-12 items-center justify-center gap-2 rounded-full text-[15px] font-semibold transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-coach',
                        'disabled:opacity-50',
                        method === 'photo'
                            ? 'bg-primary text-on-primary hover:bg-primary-hover'
                            : 'text-on-coach hover:bg-white/10',
                    )}
                >
                    <Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                    <span aria-hidden="true">{t(label)}</span>
                </button>
            ))}
        </div>
    )
}
