import DesignSystem
import Surfaces
import SwiftUI
import UIKit
@testable import Vzvesheno
import XCTest

/// Снапшоты виджетов (задачи 2.1–2.2): все размеры клиента в светлой, тёмной
/// теме и в режиме «Оттенок», виджет куратора и тексты вместо данных.
/// Сверяются с макетом Widgets.png (без системного обрамления).
///
/// Размеры — как у iPhone шириной 393 pt (макет): маленький 158 × 158,
/// средний 338 × 158, отступ содержимого 16; экран блокировки — 72 × 72,
/// 160 × 72 и строка 234 × 26 без отступов. Фон — то, что в расширении даёт
/// `containerBackground` (вне виджета он не рисуется).
@MainActor
final class WidgetSnapshotTests: XCTestCase {
    enum Family: String {
        case small, medium, circular, rectangular, inline

        var size: CGSize {
            switch self {
            case .small: return CGSize(width: 158, height: 158)
            case .medium: return CGSize(width: 338, height: 158)
            case .circular: return CGSize(width: 72, height: 72)
            case .rectangular: return CGSize(width: 160, height: 72)
            case .inline: return CGSize(width: 234, height: 26)
            }
        }

        var isHome: Bool { self == .small || self == .medium }
    }

    enum Mode: String, CaseIterable {
        case light, dark, tinted

        var scheme: ColorScheme { self == .light ? .light : .dark }
        var tint: WidgetTint { self == .tinted ? .accented : .full }
    }

    private static let today = WidgetFixture.snapshot()

    private func clientState(_ snapshot: DaySnapshot = WidgetSnapshotTests.today) -> ClientWidgetState {
        ClientWidgetState(snapshot, sessionUserID: snapshot.userID, now: WidgetFixture.friday)
    }

    @ViewBuilder
    private func client(_ family: Family, _ state: ClientWidgetState, _ mode: Mode) -> some View {
        switch family {
        case .small: ClientSmallWidgetView(state: state, tint: mode.tint)
        case .medium: ClientMediumWidgetView(state: state, tint: mode.tint)
        case .circular: ClientCircularWidgetView(state: state)
        case .rectangular: ClientRectangularWidgetView(state: state)
        case .inline: ClientInlineWidgetView(state: state)
        }
    }

    /// Макет: «Осталось», дуга, «1 923», «ккал из 2 472»; средний — «Осталось
    /// на сегодня», «1 923 ккал», «Б 49 · Ж 31 · У 212 г», вода 5 из 8,
    /// «+ стакан», «+ еда»; экран блокировки — «1923» в дуге и
    /// «1 923 ккал / Б 49 · Ж 31 · У 212 · вода 5/8».
    func testClientWidgets() {
        for family in [Family.small, .medium, .circular, .rectangular, .inline] {
            for mode in Mode.allCases {
                assertWidget(client(family, clientState(), mode), family: family, mode: mode, named: "\(family.rawValue).\(mode.rawValue)")
            }
        }
    }

    /// Сверх нормы: «+128» цветом опасности.
    func testClientOverTheNorm() {
        let state = clientState(WidgetFixture.snapshot(eaten: 2600))
        assertWidget(client(.small, state, .light), family: .small, mode: .light, named: "small")
        assertWidget(client(.medium, state, .light), family: .medium, mode: .light, named: "medium")
    }

    /// Куратор не задал цель по воде: ни точек, ни «+ стакан».
    func testClientWithoutWater() {
        let state = clientState(WidgetFixture.snapshot(water: .init(glasses: 0, goal: 8, enabled: false)))
        assertWidget(client(.medium, state, .light), family: .medium, mode: .light, named: "medium")
    }

    /// «Нет данных за сегодня», «Доступно клиентам», «Войдите во Взвешено».
    func testClientMessages() {
        let stale = clientState(WidgetFixture.snapshot(date: "2025-10-16"))
        let curatorSnapshot = DaySnapshot(userID: 3, role: "coordinator", date: WidgetFixture.fridayKey, timeZone: "Europe/Moscow",
                                          updatedAt: WidgetFixture.friday, curator: .init(attentionCount: 3, unread: 5))
        let wrongRole = ClientWidgetState(curatorSnapshot, sessionUserID: 3, now: WidgetFixture.friday)
        let signedOut = ClientWidgetState(nil, sessionUserID: nil, now: WidgetFixture.friday)
        for (name, state) in [("noData", stale), ("wrongRole", wrongRole), ("signedOut", signedOut)] {
            assertWidget(client(.small, state, .light), family: .small, mode: .light, named: "\(name).small")
            assertWidget(client(.rectangular, state, .light), family: .rectangular, mode: .light, named: "\(name).rectangular")
        }
    }

    /// Виджет куратора: «Требуют внимания» и «Непрочитанные»; клиенту — «Доступно кураторам».
    func testCuratorWidget() {
        let snapshot = DaySnapshot(userID: 3, role: "coordinator", date: WidgetFixture.fridayKey, timeZone: "Europe/Moscow",
                                   updatedAt: WidgetFixture.friday, curator: .init(attentionCount: 3, unread: 5))
        for mode in Mode.allCases {
            assertWidget(CuratorSmallWidgetView(state: CuratorWidgetState(snapshot, sessionUserID: 3), tint: mode.tint),
                         family: .small, mode: mode, named: "small.\(mode.rawValue)")
        }
        assertWidget(CuratorSmallWidgetView(state: CuratorWidgetState(WidgetFixture.snapshot(), sessionUserID: 7), tint: .full),
                     family: .small, mode: .light, named: "wrongRole")
    }

    // MARK: Снимок

    private func assertWidget<V: View>(_ view: V, family: Family, mode: Mode, named name: String,
                                       file: StaticString = #filePath, testName: String = #function, line: UInt = #line) {
        DS.Fonts.register()
        let size = family.size
        let content = view
            .padding(family.isHome ? 16 : 0)
            .frame(width: size.width, height: size.height)
            .background { background(family: family, mode: mode) }
            .foregroundStyle(DS.Color.fgDefault)
            .clipShape(RoundedRectangle(cornerRadius: family.isHome ? 22 : (family == .circular ? 36 : 12), style: .continuous))
            // Поле вокруг — «обои», как на макете.
            .padding(8)
            .background(mode == .light ? DS.Color.bgCanvas : DS.Color.coachBg)
            .environment(\.colorScheme, mode.scheme)
            .environment(\.locale, Locale(identifier: "ru_RU"))
            .environment(\.dynamicTypeSize, .large)
        let renderer = ImageRenderer(content: content)
        renderer.scale = 2
        guard let image = renderer.uiImage else {
            XCTFail("не отрисовалось: \(name)", file: file, line: line)
            return
        }
        compare(image, name: name, file: file, testName: testName, line: line)
    }

    @ViewBuilder
    private func background(family: Family, mode: Mode) -> some View {
        if family.isHome {
            // «Оттенок»: фон системы — тёмное стекло, содержимое одним тоном.
            mode == .tinted ? DS.Color.bgNav : DS.Color.bgSurface
        } else {
            // Экран блокировки: полупрозрачная подложка поверх обоев.
            family == .inline ? DS.Color.coachBg : DS.Color.fgDefault.opacity(0.18)
        }
    }

    private func compare(_ image: UIImage, name: String, file: StaticString, testName: String, line: UInt) {
        guard let cgImage = image.cgImage, let png = image.pngData() else {
            XCTFail("не отрисовалось: \(name)", file: file, line: line)
            return
        }
        let directory = URL(fileURLWithPath: "\(file)").deletingLastPathComponent().appendingPathComponent("__Snapshots__")
        let test = testName.replacingOccurrences(of: "()", with: "")
        let reference = directory.appendingPathComponent("\(test).\(name).png")
        let actual = directory.appendingPathComponent("\(test).\(name).actual.png")
        let fresh = directory.appendingPathComponent("\(test).\(name).new.png")
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try? FileManager.default.removeItem(at: actual)
        try? FileManager.default.removeItem(at: fresh)
        let environment = ProcessInfo.processInfo.environment
        let stored = (try? Data(contentsOf: reference)).flatMap { UIImage(data: $0)?.cgImage }
        let record = environment["SNAPSHOT_RECORD"] == "1"
        let ci = environment["CI"].map { !$0.isEmpty && $0 != "0" && $0.lowercased() != "false" } ?? false
        guard !record, let expected = stored else {
            if ci && !record {
                try? png.write(to: fresh)
                XCTFail("нет эталона \(reference.lastPathComponent): снимок — \(fresh.lastPathComponent) в артефакте "
                        + "ios-snapshots; сверьте с макетом, переименуйте без .new и закоммитьте", file: file, line: line)
            } else {
                try? png.write(to: reference)
                XCTFail("записан эталон \(reference.lastPathComponent) — сверьте с макетом и закоммитьте", file: file, line: line)
            }
            return
        }
        guard let difference = ScreenImageDifference.compare(expected, cgImage) else {
            try? png.write(to: actual)
            XCTFail("снапшот \(name): размер \(cgImage.width)×\(cgImage.height), эталон \(expected.width)×\(expected.height)",
                    file: file, line: line)
            return
        }
        if difference > 0.001 {
            try? png.write(to: actual)
            XCTFail("снапшот \(name) разошёлся с эталоном: \(String(format: "%.2f", difference * 100))% точек", file: file, line: line)
        }
    }
}

/// Снимок дня с макета: 1 923 из 2 472, Б 49 · Ж 31 · У 212, вода 5 из 8.
enum WidgetFixture {
    static let friday = Date(timeIntervalSince1970: 1_760_691_600)
    static let fridayKey = "2025-10-17"

    static func snapshot(userID: Int64 = 7, role: String = "client", date: String = fridayKey,
                         water: DaySnapshot.Water? = .init(glasses: 5, goal: 8, enabled: true),
                         eaten: Int = 549, goal: Int? = 2472) -> DaySnapshot {
        DaySnapshot(userID: userID, role: role, date: date, timeZone: "Europe/Moscow", updatedAt: friday,
                    nutrition: .init(eatenKcal: eaten, goalKcal: goal, protein: .init(eaten: 76, goal: 125),
                                     fat: .init(eaten: 49, goal: 80), carbs: .init(eaten: 18, goal: 230)),
                    water: water)
    }
}
