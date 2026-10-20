#if DEBUG
import DesignSystem
import SwiftUI

/// Стенд для аудита «Text clipped» (`-uiTestScenario truncationProbe`):
/// подписи заведомо обрезаны и подписи-контроли рядом. UI-тест проверяет, что
/// аудит находит первые и молчит о вторых — иначе исключения в аудите могли
/// бы тихо выключить проверку обрезки целиком. Только отладочная сборка.
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
                // Контроли и варианты шрифта.
                Text("Задачи Отчёты").font(.system(size: 13, weight: .medium)).accessibilityIdentifier("probe.sys")
                Text("Задачи Отчёты").font(Self.golos).accessibilityIdentifier("probe.golos")
                Text("Задачи Отчёты").font(.custom(DS.FontFamily.sans, size: 13)).accessibilityIdentifier("probe.golosRegular")
                Text("Задачи Отчёты").font(Self.golos).padding(.vertical, 1).accessibilityIdentifier("probe.golosV1")
                Text("Задачи Отчёты").font(Self.golos).padding(.vertical, 3).accessibilityIdentifier("probe.golosV3")
                Text("Задачи Отчёты").font(Self.golos).padding(.horizontal, 2).accessibilityIdentifier("probe.golosH2")
                Text("Отмена").font(Self.golos).accessibilityIdentifier("probe.golosClean")
                Text("Запись для Марии").dsText(DS.Typography.title2).accessibilityIdentifier("probe.literata")
                Text("Telegram · ждёт ответа 12 мин").dsText(DS.Typography.caption).accessibilityIdentifier("probe.caption")
                buttons
                fields
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
                Button {} label: {
                    Text("Обработана").font(Self.golos14).lineLimit(1)
                        .frame(maxWidth: .infinity, minHeight: 44).background(DS.Color.bgSubtle)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("probe.btnLimit")
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

    private var fields: some View {
        HStack(spacing: 8) {
            TextField("Текущий пароль", text: .constant(""))
                .font(.custom(DS.FontFamily.sans, size: 17, relativeTo: .body))
                .accessibilityIdentifier("probe.fieldGolos")
            TextField("Текущий пароль", text: .constant(""))
                .font(.system(size: 17))
                .accessibilityIdentifier("probe.fieldSystem")
        }
    }
}
#endif
