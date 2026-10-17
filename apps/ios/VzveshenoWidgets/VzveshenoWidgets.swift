import DesignSystem
import SwiftUI
import WidgetKit

@main
struct VzveshenoWidgetBundle: WidgetBundle {
    var body: some Widget {
        TodayWidget()
    }
}

struct TodayEntry: TimelineEntry {
    let date: Date
}

struct TodayProvider: TimelineProvider {
    func placeholder(in context: Context) -> TodayEntry { TodayEntry(date: .now) }
    func getSnapshot(in context: Context, completion: @escaping (TodayEntry) -> Void) { completion(TodayEntry(date: .now)) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<TodayEntry>) -> Void) {
        completion(Timeline(entries: [TodayEntry(date: .now)], policy: .never))
    }
}

struct TodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "today", provider: TodayProvider()) { _ in
            Text("Взвешено")
                .containerBackground(DS.Color.bgSurface, for: .widget)
        }
        .configurationDisplayName("Сегодня")
        .supportedFamilies([.systemSmall])
    }
}
