/**
 * Приведение цвета к тому виду, в котором его отдаёт jsdom.
 *
 * Тесты сверяют цвет нутриента с `@/shared/constants/macros`, а не с литералом:
 * второй цвет жиров, появившись где угодно, должен уронить тест, а не дожить до
 * прода, как дожило расхождение `#f59e0b` против `#eab308`. Но inline-цвет jsdom
 * возвращает как `rgb(r, g, b)`, поэтому ожидаемое значение приводится к нему.
 *
 * Помощник один на все места показа макросов: четыре его копии в четырёх файлах
 * тестов — это те же четыре объявления цвета, от которых мы и уходим.
 */
export function hexToRgb(hex: string): string {
    const value = Number.parseInt(hex.slice(1), 16)
    const red = Math.floor(value / 65536)
    const green = Math.floor(value / 256) % 256
    const blue = value % 256
    return `rgb(${red}, ${green}, ${blue})`
}
