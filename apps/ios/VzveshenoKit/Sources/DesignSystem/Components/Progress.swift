#if canImport(SwiftUI)
import SwiftUI

/// Полоса прогресса. Цвет — роль показателя; больше 100% не заполняется
/// дальше и не перекрашивается.
public struct DSProgressBar: View {
    private let fraction: Double
    private let role: DS.ColorRole
    private let thickness: CGFloat
    private let label: String
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init(value: Double, max: Double, role: DS.ColorRole = .primaryDefault, thickness: CGFloat = 4, label: String) {
        fraction = max > 0 ? Swift.min(Swift.max(value / max, 0), 1) : 0
        self.role = role
        self.thickness = thickness
        self.label = label
    }

    public var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(DS.Color.track)
                Capsule().fill(role.color).frame(width: proxy.size.width * fraction)
            }
        }
        .frame(height: thickness)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.32), value: fraction)
        .accessibilityElement()
        .accessibilityLabel(label)
        .accessibilityValue("\(Int((fraction * 100).rounded())) %")
    }
}

/// Полукруг для главного показателя дня: число внутри дуги, подпись под концами.
public struct DSProgressArc<Center: View>: View {
    private let fraction: Double
    private let role: DS.ColorRole
    private let label: String
    private let center: Center
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init(fraction: Double, role: DS.ColorRole = .primaryDefault, label: String, @ViewBuilder center: () -> Center) {
        self.fraction = Swift.min(Swift.max(fraction, 0), 1)
        self.role = role
        self.label = label
        self.center = center()
    }

    public var body: some View {
        // Дуга держит пропорции 280 × 150, а число внутри может её перерасти
        // при крупном тексте — тогда растёт вся стопка, а не обрезается число.
        ZStack(alignment: .bottom) {
            ZStack {
                ArcShape(progress: 1)
                    .stroke(DS.Color.track, style: StrokeStyle(lineWidth: 12, lineCap: .round))
                if fraction > 0 {
                    ArcShape(progress: fraction)
                        .stroke(role.color, style: StrokeStyle(lineWidth: 12, lineCap: .round))
                }
            }
            .aspectRatio(280.0 / 150.0, contentMode: .fit)
            .frame(maxWidth: 280)
            center
                .padding(.horizontal, DS.Space.s8)
                .padding(.bottom, DS.Space.s1)
        }
        .frame(maxWidth: .infinity)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.32), value: fraction)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
    }
}

private struct ArcShape: Shape {
    var progress: Double

    func path(in rect: CGRect) -> Path {
        let radius = Swift.min(rect.width / 2, rect.height) - 8
        let center = CGPoint(x: rect.midX, y: rect.maxY - 8)
        var path = Path()
        path.addArc(center: center, radius: radius, startAngle: .degrees(180),
                    endAngle: .degrees(180 + 180 * progress), clockwise: false)
        return path
    }
}
#endif
