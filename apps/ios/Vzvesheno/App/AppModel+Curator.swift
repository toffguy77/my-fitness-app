import API
import Client
import Curator
import Foundation
import Navigation
import Observation

/// Экраны куратора (`ios-curator-app`) и суперадмина: модели вкладок живут,
/// пока открыта оболочка роли. Всё в памяти — выход стирает их вместе с
/// оболочкой; кэша на диске у куратора нет, действия — только онлайн.
@MainActor
@Observable
final class CuratorWorkspace {
    let shell: Shell
    /// «Клиенты» и «Чаты» — только у куратора.
    let hub: HubModel?
    let chats: ConversationListModel?
    let leads: LeadsModel
    let support: SupportQueueModel
    let curatorID: Int64
    let calendar: DayCalendar
    /// Открытая переписка: пуш из неё не показывается баннером.
    var visibleConversationID: String?
    /// Открытая переписка — ей тоже нужны события сокета.
    @ObservationIgnored weak var openConversation: CuratorConversationModel?

    init(shell: Shell, api: APIClient, curatorID: Int64, calendar: DayCalendar) {
        self.shell = shell
        self.curatorID = curatorID
        self.calendar = calendar
        hub = shell == .curator ? HubModel(api: api, calendar: calendar) : nil
        chats = shell == .curator ? ConversationListModel(api: api) : nil
        leads = LeadsModel(api: api)
        support = SupportQueueModel(api: api)
    }

    /// Бейдж «Чатов» — непрочитанные; «Обращений» — эскалированные без ответа.
    var chatsBadge: Int { hub?.unread ?? 0 }
    var supportBadge: Int { support.escalated }

    func handle(_ event: RealtimeEvent) async {
        await hub?.handle(event)
        await chats?.handle(event)
        await openConversation?.handle(event)
    }

    /// Передний план и pull-to-refresh всего, что на виду.
    func refresh() async {
        await hub?.load()
        await support.load()
        if chats?.loaded == true { await chats?.load() }
        if leads.loaded { await leads.load() }
    }
}

extension AppModel {
    func startCurator(_ shell: Shell) {
        guard curator?.shell != shell, let userID = user?.id else { return }
        let workspace = CuratorWorkspace(shell: shell, api: api, curatorID: userID, calendar: DayCalendar(timeZone: profileTimeZone))
        curator = workspace
        publishStaffSnapshot()
        Task { [weak self] in
            await workspace.refresh()
            self?.publishStaffSnapshot()
        }
        if realtimeTask == nil { connectRealtime() }
    }

    /// Оболочка куратора или суперадмина: клиентские модели больше не нужны.
    func startStaff(_ shell: Shell) {
        guard shell == .curator || shell == .admin else {
            stopCurator()
            publishStaffSnapshot()
            return
        }
        if today != nil { stopClient() }
        startCurator(shell)
    }

    func refreshCuratorOnForeground() async {
        guard let curator else { return }
        connectRealtime()
        await curator.refresh()
        publishStaffSnapshot()
    }

    func stopCurator() {
        guard curator != nil else { return }
        curator = nil
        realtimeTask?.cancel()
        realtimeTask = nil
        Task { await realtime.disconnect() }
    }

    /// Ссылка на раздел веба: «Статьи — в веб-версии», «Админка — в веб-версии».
    func webURL(_ path: String) -> URL {
        environment.siteURL.appendingPathComponent(path)
    }
}
