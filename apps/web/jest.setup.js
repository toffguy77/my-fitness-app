import '@testing-library/jest-dom'
import { configure } from '@testing-library/react'
import 'whatwg-fetch'

// Ожидание в waitFor — пять секунд вместо одной.
//
// Три теста падали через раз и каждый раз разные: «откат при ошибке API»,
// «обработка сетевой ошибки», «отправка сообщения». Все три написаны верно — с
// waitFor и act, — и поодиночке проходят всегда. Срывались они только в полном
// прогоне, когда машина занята: секунды не хватало, чтобы дождаться того, что
// всё равно происходило.
//
// Тест, падающий через раз, подтачивает доверие к проверкам так же, как шумное
// оповещение: его начинают перезапускать не глядя, и однажды перезапустят
// настоящую поломку. Запас по времени ничего не ослабляет — ожидание
// заканчивается, как только условие выполнено, и удлиняется только у тех, кто
// иначе сорвался бы.
configure({ asyncUtilTimeout: 5000 })

// Mock scrollIntoView (not available in jsdom).
// Guarded: a test that runs in the node environment — the edge middleware, for
// one — has no DOM at all, and this file is loaded for every environment.
if (typeof Element !== 'undefined') {
    Element.prototype.scrollIntoView = jest.fn();
}

// Suppress React act() warnings and expected test errors
const originalError = console.error;
beforeAll(() => {
    console.error = (...args) => {
        if (
            typeof args[0] === 'string' &&
            (args[0].includes('Warning: An update to') ||
                args[0].includes('An update to') ||
                args[0].includes('The current testing environment is not configured to support act')) &&
            (args[0].includes('was not wrapped in act') ||
                args[0].includes('not configured to support act'))
        ) {
            return;
        }

        // Suppress expected JSON parsing errors in tests
        if (
            typeof args[0] === 'string' &&
            (args[0].includes('Failed to parse user data:') ||
                args[0].includes('Failed to load cached notifications:') ||
                args[0].includes('Polling failed:'))
        ) {
            return;
        }

        originalError.call(console, ...args);
    };
});

afterAll(() => {
    console.error = originalError;
});

// Polyfill for BroadcastChannel (required by MSW)
if (typeof global.BroadcastChannel === 'undefined') {
    global.BroadcastChannel = class BroadcastChannel {
        constructor(name) {
            this.name = name;
        }
        postMessage() { }
        close() { }
        addEventListener() { }
        removeEventListener() { }
    };
}

// Mock react-window for tests
jest.mock('react-window', () => ({
    List: function MockList({ rowComponent: RowComponent, rowCount, rowHeight, children, listRef, defaultHeight, ...rest }) {
        const React = require('react');
        const rows = [];
        for (let index = 0; index < rowCount; index++) {
            const style = {
                position: 'absolute',
                top: index * (typeof rowHeight === 'number' ? rowHeight : 100),
                height: typeof rowHeight === 'number' ? rowHeight : 100,
                width: '100%',
            };
            rows.push(
                React.createElement(RowComponent, {
                    key: index,
                    index,
                    style,
                })
            );
        }
        return React.createElement(
            'div',
            {
                'data-testid': 'react-window-list',
                style: { position: 'relative', height: defaultHeight || 600, overflow: 'auto' },
                ...rest,
            },
            rows,
            children
        );
    },
    FixedSizeList: function MockFixedSizeList({ children, itemCount, itemSize, height, width, ...rest }) {
        const React = require('react');
        const rows = [];
        for (let index = 0; index < itemCount; index++) {
            const style = {
                position: 'absolute',
                top: index * itemSize,
                height: itemSize,
                width: '100%',
            };
            rows.push(children({ index, style }));
        }
        return React.createElement(
            'div',
            {
                'data-testid': 'react-window-list',
                style: { position: 'relative', height, width, overflow: 'auto' },
                ...rest,
            },
            rows
        );
    },
}));

// MSW temporarily disabled due to Jest compatibility issues with ESM modules
// Tests will use fetch mocking instead
// import { server } from './__mocks__/server'

// beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }))
// afterEach(() => server.resetHandlers())
// afterAll(() => server.close())

// Ни один тест не выходит в сеть.
//
// Пока запроса не было видно, это стоило двух падений и часа на чтение: с
// отключённым MSW незамоканный fetch уходил в настоящую сеть, `whatwg-fetch`
// реализует его поверх XMLHttpRequest из jsdom, и всё это возвращалось ошибкой
// рукопожатия TLS, не называвшей ни адреса, ни виновника. Падали при этом два
// теста food-tracker, которые про сеть ничего не знают: отправлял буфер
// логгер и клиент продуктовых событий.
//
// Тест, который что-то отправляет наружу, зависит от сети и от чужого сервера.
// Здесь он вместо этого падает с адресом в сообщении.
//
// Свой мок в тесте перекрывает этот запрет — он ловит только то, что никто не
// подменил, то есть ровно случайные обращения.
const forbidNetwork = (url) => {
    throw new Error(
        `Тест обратился в сеть: ${url}\n` +
        `Подмените транспорт в самом тесте. Реальный запрос делает результат ` +
        `зависимым от сети и от чужого сервера.`,
    )
}

beforeEach(() => {
    global.fetch = jest.fn((input) =>
        forbidNetwork(typeof input === 'string' ? input : (input?.url ?? String(input))),
    )

    // `sendBeacon` в jsdom нет, а его отсутствие уводит отправку событий в
    // запасной путь через fetch. Пустая заглушка сообщает вызывающему, что
    // отправка принята, и никуда не идёт.
    if (typeof navigator !== 'undefined') {
        Object.defineProperty(navigator, 'sendBeacon', {
            value: jest.fn().mockReturnValue(true),
            configurable: true,
            writable: true,
        })
    }
})
