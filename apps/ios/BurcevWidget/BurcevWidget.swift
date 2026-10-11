import SwiftUI
import WidgetKit

struct TodayEntry: TimelineEntry {
    let date: Date
    let snapshot: TodaySnapshot?
}

struct TodayProvider: TimelineProvider {
    func placeholder(in context: Context) -> TodayEntry {
        TodayEntry(date: Date(), snapshot: TodaySnapshot(
            day: TodaySnapshot.dayString(Date()), calories: 1240, caloriesTarget: 1850,
            protein: 82, fat: 41, carbs: 130, waterGlasses: 5, waterGoal: 8, updatedAt: Date()))
    }

    func getSnapshot(in context: Context, completion: @escaping (TodayEntry) -> Void) {
        completion(context.isPreview ? placeholder(in: context) : TodayEntry(date: Date(), snapshot: TodaySnapshot.load()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TodayEntry>) -> Void) {
        let entry = TodayEntry(date: Date(), snapshot: TodaySnapshot.load())
        // Свежие данные приносит само приложение (reloadAllTimelines); раз в
        // полчаса — чтобы в полночь сменился день.
        completion(Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(30 * 60))))
    }
}

struct TodayWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: TodayEntry

    private var snapshot: TodaySnapshot? {
        guard let s = entry.snapshot, s.isToday else { return nil }
        return s
    }

    var body: some View {
        Group {
            if let s = snapshot {
                switch family {
                case .systemMedium: medium(s)
                default: small(s)
                }
            } else {
                VStack(spacing: 6) {
                    Image(systemName: "fork.knife").font(.title2)
                    Text("Откройте BURCEV, чтобы увидеть день").font(.caption).multilineTextAlignment(.center)
                }
            }
        }
        .containerBackground(.fill.tertiary, for: .widget)
        .widgetURL(URL(string: "burcev://today"))
    }

    private func small(_ s: TodaySnapshot) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Сегодня").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            ring(s).frame(width: 64, height: 64)
            if let glasses = s.waterGlasses, let goal = s.waterGoal {
                Label("\(glasses)/\(goal)", systemImage: "drop.fill").font(.caption).foregroundStyle(.blue)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    private func medium(_ s: TodaySnapshot) -> some View {
        HStack(spacing: 16) {
            ring(s).frame(width: 84, height: 84)
            VStack(alignment: .leading, spacing: 4) {
                Text("Сегодня").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                Text("Б \(Int(s.protein)) · Ж \(Int(s.fat)) · У \(Int(s.carbs))").font(.subheadline).monospacedDigit()
                if let glasses = s.waterGlasses, let goal = s.waterGoal {
                    Label("Вода \(glasses) из \(goal)", systemImage: "drop.fill").font(.subheadline).foregroundStyle(.blue)
                }
                Text("обновлено \(s.updatedAt.formatted(date: .omitted, time: .shortened))")
                    .font(.caption2).foregroundStyle(.tertiary)
            }
            Spacer(minLength: 0)
        }
    }

    private func ring(_ s: TodaySnapshot) -> some View {
        let progress = s.caloriesTarget.map { $0 > 0 ? min(s.calories / $0, 1) : 0 } ?? 0
        return ZStack {
            Circle().stroke(Color.secondary.opacity(0.2), lineWidth: 8)
            Circle().trim(from: 0, to: progress)
                .stroke(Color.accentColor, style: StrokeStyle(lineWidth: 8, lineCap: .round))
                .rotationEffect(.degrees(-90))
            VStack(spacing: 0) {
                Text("\(Int(s.calories))").font(.headline).monospacedDigit().minimumScaleFactor(0.6)
                if let target = s.caloriesTarget {
                    Text("из \(Int(target))").font(.caption2).foregroundStyle(.secondary)
                } else {
                    Text("ккал").font(.caption2).foregroundStyle(.secondary)
                }
            }
        }
    }
}

struct TodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "BurcevToday", provider: TodayProvider()) { entry in
            TodayWidgetView(entry: entry)
        }
        .configurationDisplayName("BURCEV — сегодня")
        .description("Калории к норме и вода за сегодня.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

@main
struct BurcevWidgets: WidgetBundle {
    var body: some Widget {
        TodayWidget()
    }
}
