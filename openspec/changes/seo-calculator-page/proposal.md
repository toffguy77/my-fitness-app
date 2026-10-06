## Why

SEO-аудит, замечание 4 (блокер): калькулятор закрыт от роботов. `robots.txt`
содержит `Disallow: /onboarding` (`apps/web/src/app/robots.ts:18,35`), а
единственный калькулятор продукта живёт именно там. «Калькулятор КБЖУ» —
основной поисковый запрос ниши, и у сайта нет страницы, которая могла бы по нему
ранжироваться.

Сам `/onboarding` для этого не годится. Это пошаговый мастер для двух аудиторий
(`apps/web/src/app/onboarding/page.tsx:14-29`), он ничего не рендерит, пока
не известна сессия (`return null`), и в нём нет текста. Его закрытие от индексации
правильно и остаётся.

## What Changes

- Новая открытая страница `/kalkulyator-kbzhu`. Серверный рендер: `h1`,
  вступление, калькулятор на одном экране, 300–400 слов о том, как считается
  норма, и блок «Вопросы и ответы» с разметкой `FAQPage`.
- Калькулятор — клиентский компонент `KbzhuCalculator`. Он считает через ту же
  публичную ручку `POST /api/v1/public/nutrition/calculate`, что и мастер, и
  пишет параметры в то же хранилище мастера. «Сохранить результат» ведёт в
  `/onboarding` сразу на экран результата, где оставляют контакт.
- Текст описывает фактическую формулу сервиса (Миффлин — Сан Жеор,
  коэффициенты активности, поправки цели, белок на килограмм), а не
  абстрактную.
- Событие аналитики `calculator_result` отделяет расчёты на этой странице от
  воронки мастера.
- Ссылка на калькулятор в подвале посадочной страницы.

## Capabilities

### New Capabilities
- `calculator-landing`: открытая индексируемая страница калькулятора КБЖУ.

### Modified Capabilities
- `product-analytics`: в словарь добавляется `calculator_result`.

## Impact

- Новые: `apps/web/src/app/kalkulyator-kbzhu/page.tsx`,
  `apps/web/src/features/onboarding/components/KbzhuCalculator.tsx`.
- `apps/web/src/features/onboarding/store/guestOnboardingStore.ts:72-106` —
  используется как есть (`load`, `setResult`, `setStep`).
- `apps/web/src/shared/analytics/events.ts` и
  `apps/api/internal/modules/analytics/` — словари событий.
- `apps/web/src/app/page.tsx:236-247` — подвал посадочной.
- `apps/web/src/app/robots.ts` — без `Disallow` для нового пути (см.
  `robots-directives-cleanup`).
