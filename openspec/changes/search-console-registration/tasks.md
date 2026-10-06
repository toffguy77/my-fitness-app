## 1. Код

- [x] 1.1 Тест `robots.test.ts`: директива `Sitemap` с абсолютным адресом. Тест метаданных макета: нет `verification.yandex`. Проверка: `npx jest robots layout-metadata` зелёный (поведение уже такое, тест закрепляет его).

## 2. Живая проверка

- [x] 2.1 После выкатки `seo-sitemap-at-request` на прод: `curl -sI https://burcev.team/sitemap.xml` → `200`, `content-type: application/xml`; статьи в карте есть. *Проверено 2026-10-06 на dev и на проде (`v2026.10.06+31a71d72`).*
- [ ] 2.2 Владелец отправляет `https://burcev.team/sitemap.xml` в Яндекс Вебмастер («Индексирование → Файлы Sitemap») и, если сайт добавлен, в Google Search Console. Проверка: статус файла в Вебмастере «OK» (обработка занимает до двух недель). **Действие владельца.**
