#if canImport(SwiftUI)
import SwiftUI

/// Неделя точками: высота точки — отклонение от нормы, полоса — коридор
/// ±допуск; сегодня — пунктирное кольцо без оценки.
public struct WeekDotsView: View {
    private let days: [WeekDay]
    private let tolerance: Double
    private let plotHeight: CGFloat = 80
    private let range = 0.25

    public init(days: [WeekDay], tolerance: Double = 0.05) {
        self.days = days
        self.tolerance = tolerance
    }

    public var body: some View {
        let center = plotHeight / 2
        let scale = center / range
        let bandHalf = max(10, tolerance * scale)
        VStack(spacing: DS.Space.s2) {
            ZStack(alignment: .top) {
                RoundedRectangle(cornerRadius: DS.Radius.xs)
                    .fill(DS.Color.bgSubtle)
                    .frame(height: bandHalf * 2)
                    .offset(y: center - bandHalf)
                    .accessibilityHidden(true)
                HStack(spacing: 0) {
                    ForEach(days) { day in
                        dot(day, center: center, scale: scale)
                            .frame(maxWidth: .infinity, minHeight: plotHeight, maxHeight: plotHeight, alignment: .top)
                            .accessibilityElement()
                            .accessibilityLabel(day.accessibilityLabel)
                    }
                }
            }
            HStack(spacing: 0) {
                ForEach(days) { day in
                    Text(day.label)
                        .dsText(DS.Typography.micro)
                        .foregroundStyle(day.isToday ? DS.Color.fgDefault : DS.Color.fgSubtle)
                        .frame(maxWidth: .infinity)
                        .accessibilityHidden(true)
                }
            }
        }
    }

    @ViewBuilder
    private func dot(_ day: WeekDay, center: CGFloat, scale: CGFloat) -> some View {
        if day.isToday || day.deviation == nil {
            Circle()
                .strokeBorder(day.isToday ? DS.Color.primaryDefault : DS.Color.fgSubtle,
                              style: StrokeStyle(lineWidth: 2, dash: [2, 2]))
                .frame(width: 12, height: 12)
                .offset(y: center - 6)
        } else {
            let clamped = max(-range, min(range, day.deviation ?? 0))
            Circle()
                .fill(day.isInside(tolerance: tolerance) ? DS.Color.fgDefault : DS.Color.statusWarning)
                .frame(width: 12, height: 12)
                .offset(y: center - clamped * scale - 6)
        }
    }
}
#endif
