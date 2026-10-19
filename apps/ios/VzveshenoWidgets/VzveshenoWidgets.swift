import DesignSystem
import Surfaces
import SwiftUI
import WidgetKit

/// Расширение виджетов (`ios-system-surfaces`): виджеты клиента и куратора и
/// элементы Пункта управления.
///
/// Виджет читает только снимок дня из App Group и сверяет его с сессией в
/// Keychain: нет сессии или снимок чужого аккаунта — «Войдите во Взвешено»,
/// без данных. Сеть виджет не трогает, сессию не обновляет.
@main
struct VzveshenoWidgetBundle: WidgetBundle {
    init() {
        DS.Fonts.register()
    }

    var body: some Widget {
        TodayWidget()
        CuratorWidget()
        AddWaterControl()
        PhotoFoodControl()
        BarcodeControl()
    }
}

struct SurfaceEntry: TimelineEntry {
    let date: Date
    let snapshot: DaySnapshot?
    let sessionUserID: Int64?

    var client: ClientWidgetState { ClientWidgetState(snapshot, sessionUserID: sessionUserID, now: date) }
    var curator: CuratorWidgetState { CuratorWidgetState(snapshot, sessionUserID: sessionUserID) }

    /// Галерея виджетов и заглушка до первой загрузки: пример, а не чужие данные.
    static func sample(role: String, date: Date = .now) -> SurfaceEntry {
        let zone = TimeZone.current
        let snapshot = DaySnapshot(
            userID: 0, role: role, date: SurfaceCalendar.dayKey(date, in: zone), timeZone: zone.identifier, updatedAt: date,
            nutrition: .init(eatenKcal: 549, goalKcal: 2472, protein: .init(eaten: 76, goal: 125),
                             fat: .init(eaten: 49, goal: 80), carbs: .init(eaten: 18, goal: 230)),
            water: .init(glasses: 5, goal: 8, enabled: true),
            curator: .init(attentionCount: 3, unread: 5))
        return SurfaceEntry(date: date, snapshot: snapshot, sessionUserID: 0)
    }
}

struct SurfaceProvider: TimelineProvider {
    let sampleRole: String

    func placeholder(in context: Context) -> SurfaceEntry {
        .sample(role: sampleRole)
    }

    func getSnapshot(in context: Context, completion: @escaping (SurfaceEntry) -> Void) {
        completion(context.isPreview ? .sample(role: sampleRole) : current(at: .now))
    }

    /// Запись сейчас и на ближайшую полночь по поясу профиля: в полночь
    /// вчерашний остаток сменяется «Нет данных за сегодня».
    func getTimeline(in context: Context, completion: @escaping (Timeline<SurfaceEntry>) -> Void) {
        let now = Date()
        let entry = current(at: now)
        let entries = WidgetTimelinePlan.dates(snapshot: entry.snapshot, now: now).map {
            SurfaceEntry(date: $0, snapshot: entry.snapshot, sessionUserID: entry.sessionUserID)
        }
        completion(Timeline(entries: entries, policy: .atEnd))
    }

    private func current(at date: Date) -> SurfaceEntry {
        SurfaceEntry(date: date, snapshot: SurfaceEnvironment.snapshots.load(), sessionUserID: SurfaceEnvironment.session.user?.id)
    }
}

struct TodayWidgetView: View {
    @Environment(\.widgetFamily) private var family
    @Environment(\.widgetRenderingMode) private var renderingMode
    let entry: SurfaceEntry

    var body: some View {
        let state = entry.client
        Group {
            switch family {
            case .systemMedium:
                ClientMediumWidgetView(state: state, tint: WidgetTint(renderingMode), foodURL: foodURL)
            case .accessoryCircular:
                ClientCircularWidgetView(state: state)
            case .accessoryRectangular:
                ClientRectangularWidgetView(state: state)
            case .accessoryInline:
                ClientInlineWidgetView(state: state)
            default:
                ClientSmallWidgetView(state: state, tint: WidgetTint(renderingMode))
            }
        }
        .foregroundStyle(DS.Color.fgDefault)
        .containerBackground(DS.Color.bgSurface, for: .widget)
        .widgetURL(SurfaceEnvironment.link("/dashboard"))
    }
}

extension TodayWidgetView {
    /// «+ еда» — лист «Записать еду» на поиске.
    var foodURL: URL {
        SurfaceEnvironment.link("/food-tracker", query: [URLQueryItem(name: "add", value: "search")])
    }
}

struct TodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "today", provider: SurfaceProvider(sampleRole: "client")) { entry in
            TodayWidgetView(entry: entry)
        }
        .configurationDisplayName("Остаток дня")
        .description("Сколько калорий осталось на сегодня, макросы и вода.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

struct CuratorWidgetView: View {
    @Environment(\.widgetRenderingMode) private var renderingMode
    let entry: SurfaceEntry

    var body: some View {
        CuratorSmallWidgetView(state: entry.curator, tint: WidgetTint(renderingMode))
            .foregroundStyle(DS.Color.fgDefault)
            .containerBackground(DS.Color.bgSurface, for: .widget)
            .widgetURL(SurfaceEnvironment.link("/curator/clients"))
    }
}

struct CuratorWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "curator", provider: SurfaceProvider(sampleRole: "coordinator")) { entry in
            CuratorWidgetView(entry: entry)
        }
        .configurationDisplayName("Клиенты")
        .description("Сколько клиентов требуют внимания и непрочитанные сообщения.")
        .supportedFamilies([.systemSmall])
    }
}
