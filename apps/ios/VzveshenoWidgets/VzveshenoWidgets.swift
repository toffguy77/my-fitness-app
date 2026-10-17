import DesignSystem
import Outbox
import SwiftUI
import WidgetKit

/// Расширение виджетов. В этом изменении — каркас: снимок дня из общего
/// контейнера App Group; без снимка (нет входа, выход) — данных аккаунта нет.
/// Виджеты с данными — изменение ios-system-surfaces.
@main
struct VzveshenoWidgetBundle: WidgetBundle {
    init() {
        DS.Fonts.register()
    }

    var body: some Widget {
        TodayWidget()
    }
}

struct TodayEntry: TimelineEntry {
    let date: Date
    let signedIn: Bool
}

struct TodayProvider: TimelineProvider {
    private var snapshot: DaySnapshotStore {
        let group = Bundle.main.object(forInfoDictionaryKey: "AppGroupID") as? String
        return DaySnapshotStore(url: ProtectedFiles.directory(appGroup: group).appendingPathComponent("today-snapshot.json"))
    }

    func placeholder(in context: Context) -> TodayEntry {
        TodayEntry(date: .now, signedIn: true)
    }

    func getSnapshot(in context: Context, completion: @escaping (TodayEntry) -> Void) {
        completion(TodayEntry(date: .now, signedIn: snapshot.load() != nil))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TodayEntry>) -> Void) {
        completion(Timeline(entries: [TodayEntry(date: .now, signedIn: snapshot.load() != nil)], policy: .never))
    }
}

struct TodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "today", provider: TodayProvider()) { entry in
            VStack(alignment: .leading, spacing: DS.Space.s1) {
                Text("Взвешено")
                    .dsText(DS.Typography.title3)
                Text(entry.signedIn ? "Сегодня" : "Войдите в приложение")
                    .dsText(DS.Typography.caption)
                    .foregroundStyle(DS.Color.fgMuted)
            }
            .foregroundStyle(DS.Color.fgDefault)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .containerBackground(DS.Color.bgSurface, for: .widget)
        }
        .configurationDisplayName("Сегодня")
        .description("День во «Взвешено».")
        .supportedFamilies([.systemSmall])
    }
}
