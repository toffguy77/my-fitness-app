/**
 * Оформление графиков recharts из ролей дизайн-системы.
 *
 * recharts пишет цвет в атрибуты SVG (`fill`, `stroke`), а не в классы, поэтому
 * Tailwind сюда не достаёт. CSS-переменная в атрибуте работает и сама
 * переключается с темой; до этого модуля в пяти графиках жили пять копий
 * `#9ca3af` и `#f0f0f0`, светлых на любой теме.
 */
import { color } from '@burcev/design-tokens'

export const chartColor = color

/** Подписи осей. */
export const AXIS_STYLE = { fontSize: 11, fill: color['fg-subtle'] } as const

/** Сетка и опорные линии. */
export const GRID_STROKE = color.line

/** Линия нормы/цели: пунктир цветом третичного текста. */
export const TARGET_STROKE = color['fg-subtle']

/** Подсказка при наведении — та же поверхность, что у карточек. */
export const TOOLTIP_CLASS = 'rounded-lg border border-line bg-surface px-3 py-2 shadow-overlay'
