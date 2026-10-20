#if DEBUG
import DesignSystem
import SwiftUI

/// Стенд для аудита «Text clipped» (`-uiTestScenario truncationProbe`).
/// Аудит перерисовывает экран на крупных размерах Dynamic Type и ищет текст,
/// который там обрезается: `lineLimit`, фиксированная высота, сжатие по
/// вертикали. Выносные элементы шрифта тут ни при чём — глифы Literata и
/// Golos лежат внутри строки шрифта. Здесь подписи, обрезанные заведомо, и
/// контроли, которые аудит находить не должен: UI-тест проверяет и то и
/// другое, чтобы исключения аудита не выключили проверку обрезки тихо.
/// Только отладочная сборка.
struct TruncationProbeView: View {
    private static var golos: Font { Font.custom(DS.FontFamily.sans, size: 13, relativeTo: .footnote).weight(.medium) }
    private static var golos14: Font { Font.custom(DS.FontFamily.sans, size: 14, relativeTo: .callout).weight(.medium) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 6) {
                // Обрезаны по-настоящему.
                Text("Подпись, которая никак не помещается в ширину")
                    .font(.custom(DS.FontFamily.sans, size: 15, relativeTo: .body))
                    .lineLimit(1)
                    .frame(width: 90, alignment: .leading)
                    .accessibilityIdentifier("probe.truncated")
                Text("Обрезано по высоте")
                    .font(.custom(DS.FontFamily.sans, size: 15, relativeTo: .body))
                    .frame(height: 8)
                    .clipped()
                    .accessibilityIdentifier("probe.clippedHeight")
                // Контроли: шрифты бренда с выносными элементами и надстрочными.
                Text("Задачи Отчёты").font(.system(size: 13, weight: .medium)).accessibilityIdentifier("probe.sys")
                Text("Задачи Отчёты").font(Self.golos).accessibilityIdentifier("probe.golos")
                Text("Отмена").font(Self.golos).accessibilityIdentifier("probe.golosClean")
                Text("Запись для Марии").dsText(DS.Typography.title2).accessibilityIdentifier("probe.literata")
                Text("Telegram · ждёт ответа 12 мин").dsText(DS.Typography.caption).accessibilityIdentifier("probe.caption")
                buttons
                SegmentBar(items: ["Обзор", "План", "Задачи", "Отчёты"], selection: .constant("Обзор"),
                           title: { $0 }, identifier: { "probe.\($0)" })
            }
            .padding(DS.Space.s4)
        }
        .background(DS.Color.bgCanvas)
        .accessibilityIdentifier("screen.truncationProbe")
    }

    private var buttons: some View {
        VStack(spacing: 6) {
            HStack(spacing: 8) {
                Button("Обработана") {}
                    .buttonStyle(CardButtonStyle(kind: .dark))
                    .accessibilityIdentifier("probe.cardStyle")
                // Обрезана на крупных размерах: одна строка при любом шрифте.
                Button {} label: {
                    Text("Обработана").font(Self.golos14).lineLimit(1)
                        .frame(maxWidth: .infinity, minHeight: 44).background(DS.Color.bgSubtle)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("probe.lineLimit")
            }
            HStack(spacing: 8) {
                Button {} label: {
                    Text("Обработана").font(Self.golos14).minimumScaleFactor(0.8)
                        .frame(maxWidth: .infinity, minHeight: 44).background(DS.Color.bgSubtle)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("probe.btnScale")
                Button {} label: {
                    Text("Обработана").font(Self.golos14)
                        .frame(maxWidth: .infinity, minHeight: 44).background(DS.Color.bgSubtle)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("probe.btnPlain")
                Button {} label: {
                    Text("Обработана").font(.system(size: 14, weight: .medium))
                        .frame(maxWidth: .infinity, minHeight: 44).background(DS.Color.bgSubtle)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("probe.btnSystem")
            }
        }
    }
}
#endif
