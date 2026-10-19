import API
import Client
import Foundation
import Navigation
import Outbox
import Session

/// Итоги досылки очереди → экраны (`ios-offline-outbox`, «Сервер отказал по
/// существу»): откат оптимистичного результата и сообщение по коду ошибки,
/// откуда бы досылка ни запускалась.
final class AppOutboxObserver: OutboxObserver, @unchecked Sendable {
    private weak var model: AppModel?

    @MainActor
    init(model: AppModel) {
        self.model = model
    }

    func outboxDelivered(_ item: OutboxItem, response: RawResponse) async {}

    func outboxRejected(_ item: OutboxItem, error: APIError) async {
        await model?.outboxRejected(kind: item.kind, item: item, error: error)
    }
}

extension AppModel {
    /// Сессия и конфигурация с устройства — один раз за процесс. Всё
    /// локальное: Keychain и файлы, без сети.
    func ensureRestored() async {
        if let restoring {
            await restoring.value
            return
        }
        let observer = AppOutboxObserver(model: self)
        let task = Task { @MainActor in
            // Итоги любой досылки — фоновой, по сети, из пуша — доходят до экранов.
            await outbox.setObserver(observer)
            await session.attach()
            // Решение о версии — сразу по сохранённой конфигурации, затем по свежей.
            config = configCache.load()
            user = await session.restore()
            // Запрошенное удаление — и после перезапуска, до любого другого экрана.
            if user != nil { pendingDeletion = await session.storedPendingDeletion() }
            await applyCachedProfile()
        }
        restoring = task
        await task.value
    }

    /// Досылка — только после восстановления сессии: до него `user` пуст, и
    /// очередь не знала бы, чьим токеном отправлять.
    func drainOutbox() async {
        await ensureRestored()
        await outbox.drain(userID: user?.id)
    }

    /// Фоновое обновление (`BGAppRefreshTask`): следующее — сразу, затем
    /// отложенный выход и очередь.
    func backgroundRefresh() async {
        OutboxBackgroundTask.schedule(id: environment.outboxTaskID)
        await ensureRestored()
        await session.flushPendingLogout()
        await drainOutbox()
    }

    /// Монитор сети: пропала — оболочка сразу с плашкой; появилась — плашка
    /// снимается, свежие данные приходят с `onForeground`.
    func networkChanged(available: Bool) {
        guard offline == available else { return }
        offline = !available
        recompute()
    }

    /// Отказ — владельцу изменения; нет экрана — общее сообщение.
    func outboxRejected(kind: String, item: OutboxItem?, error: APIError) async {
        let owner = OutboxRejectionOwner(kind: kind)
        switch owner {
        case .diary where diary != nil:
            if let item, let diary {
                await diary.outboxRejected(item, error: error)
            } else {
                diary?.notice = owner.message(for: error, messages: messages)
                await diary?.load()
            }
            await today?.load()
        case .today where today != nil:
            if let item, let today {
                await today.outboxRejected(item, error: error)
            } else {
                today?.notice = owner.message(for: error, messages: messages)
                await today?.load()
            }
        case .chat where chat != nil:
            if let item {
                chat?.outboxRejected(item, error: error)
            } else {
                chat?.notice = owner.message(for: error, messages: messages)
            }
        default:
            outboxNotice = owner.message(for: error, messages: messages)
        }
    }

    /// Отказы, случившиеся в расширении виджетов, — при выходе на передний план.
    func showExtensionRejections() async {
        guard let userID = user?.id else { return }
        for change in rejections.take(userID: userID) {
            await outboxRejected(kind: change.kind, item: nil, error: change.error)
        }
    }
}
