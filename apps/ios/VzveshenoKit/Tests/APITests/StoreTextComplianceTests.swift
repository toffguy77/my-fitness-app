import Foundation
import TestSupport
import XCTest

/// App Review 3.1.1(a): приложение не продаёт и не упоминает платный доступ —
/// ни слов о подписке, оплате, тарифах и цене, ни призыва оставить заявку.
/// Проверяется каждая строка, которую может увидеть человек: все значения всех
/// String Catalogs (ошибки, интерфейс, склонения) и все строковые литералы
/// исходников приложения, расширения и VzveshenoKit — большая часть текста
/// интерфейса живёт литералами в `Text("…")`, а не в каталоге.
final class StoreTextComplianceTests: XCTestCase {
    static let forbidden = try! NSRegularExpression(  // swiftlint:disable:this force_try
        pattern: "подписк|оплат|₽|тариф|стоит|купить|заявк", options: [.caseInsensitive])

    /// «Заявки» — очередь лидов куратора и суперадмина (`ios-curator-leads`):
    /// интерфейс сотрудника, клиенту не показывается — вкладка есть только в
    /// оболочке куратора (`Shell`), а сервер отдаёт `/curator/leads` только
    /// сотрудникам. Здесь «заявка» — лид, а не призыв клиенту что-то оформить.
    /// Исключение только для «заявк»: слова о цене и оплате запрещены и там.
    static let staffOnlyWord = "заявк"
    /// Ключи каталогов, которые видит только сотрудник.
    static let staffKeys: Set<String> = ["tab.leads", "error.lead_already_claimed"]
    /// Исходники, которые рисуются только в оболочке сотрудника.
    static let staffSources = ["apps/ios/Vzvesheno/Curator/"]
    /// Отдельные литералы общих файлов, которые видит только сотрудник:
    /// заголовок экрана заявки в навигации оболочки (`ShellView`, `.lead`).
    static let staffLiterals: [String: Set<String>] = ["apps/ios/Vzvesheno/Shell/ShellView.swift": ["Заявка"]]
    /// Данные заглушек UI-тестов (`#if DEBUG`): статьи сервера с тарифами
    /// нужны, чтобы проверить, что приложение превращает такую ссылку в текст.
    /// В выпускную сборку они не попадают — тест требует `#if DEBUG` в начале файла.
    static let debugFixtures = ["apps/ios/Vzvesheno/Support/UITestScenario"]

    static let catalogs = [
        "apps/ios/Vzvesheno/Resources/Localizable.xcstrings",
        "apps/ios/VzveshenoKit/Sources/API/Localizable.xcstrings",
        "apps/ios/VzveshenoKit/Sources/DesignSystem/Strings/Plurals.xcstrings",
    ]
    static let sourceRoots = ["apps/ios/Vzvesheno", "apps/ios/Shared", "apps/ios/VzveshenoWidgets", "apps/ios/VzveshenoKit/Sources"]

    static func isForbidden(_ text: String, staff: Bool) -> Bool {
        let range = NSRange(text.startIndex..., in: text)
        return forbidden.matches(in: text, range: range).contains { match in
            guard let found = Range(match.range, in: text) else { return true }
            return !(staff && text[found].lowercased() == staffOnlyWord)
        }
    }

    func testNoPaidAccessWordsInStringCatalogs() throws {
        var checked = 0
        var offending: [String] = []
        for path in Self.catalogs {
            let catalog = try StringCatalog(relativePath: path)
            XCTAssertFalse(catalog.entries.isEmpty, "\(path) не разобрался")
            for (key, forms) in catalog.entries {
                for (form, text) in forms {
                    checked += 1
                    if Self.isForbidden(text, staff: Self.staffKeys.contains(key)) {
                        offending.append("\(path): \(key) [\(form)] «\(text)»")
                    }
                }
            }
        }
        XCTAssertGreaterThan(checked, 80, "каталоги прочитались не целиком")
        XCTAssertEqual(offending, [], "слова о платном доступе в приложении (App Review 3.1.1(a))")
    }

    func testNoPaidAccessWordsInSourceLiterals() throws {
        let files = try Self.sourceRoots.flatMap(Self.swiftFiles)
        XCTAssertGreaterThan(files.count, 100, "исходники не нашлись — проверка пустая")
        var offending: [String] = []
        for path in files {
            let source = try RepositoryFiles.read(path)
            if Self.debugFixtures.contains(where: path.hasPrefix) {
                XCTAssertTrue(source.hasPrefix("#if DEBUG"), "\(path): заглушки — только в отладочной сборке")
                continue
            }
            let staffFile = Self.staffSources.contains(where: path.hasPrefix)
            for literal in Self.literals(in: source) {
                let staff = staffFile || Self.staffLiterals[path]?.contains(literal) == true
                if Self.isForbidden(literal, staff: staff) {
                    offending.append("\(path): «\(literal)»")
                }
            }
        }
        XCTAssertEqual(offending, [], "слова о платном доступе в приложении (App Review 3.1.1(a))")
    }

    /// Сама проверка ловит то, ради чего написана.
    func testDetectorCatchesForbiddenWords() {
        XCTAssertTrue(Self.isForbidden("Работа с куратором доступна по подписке", staff: false))
        XCTAssertTrue(Self.isForbidden("Оставьте заявку", staff: false))
        XCTAssertTrue(Self.isForbidden("990 ₽ в месяц", staff: true), "цена запрещена и в интерфейсе сотрудника")
        XCTAssertFalse(Self.isForbidden("Заявки", staff: true))
        XCTAssertEqual(Self.literals(in: #"Text("Купить") // "оплата" в комментарии"#), ["Купить"])
        XCTAssertEqual(Self.literals(in: "let a = \"\"\"\n    Тарифы\n    \"\"\"\n"), ["    Тарифы\n    "])
    }

    // MARK: Разбор исходников

    static func swiftFiles(under root: String) throws -> [String] {
        let base = RepositoryFiles.url(root)
        guard let walker = FileManager.default.enumerator(at: base, includingPropertiesForKeys: nil) else { return [] }
        var result: [String] = []
        let prefix = RepositoryFiles.root().standardizedFileURL.path + "/"
        for case let url as URL in walker where url.pathExtension == "swift" {
            result.append(String(url.standardizedFileURL.path.dropFirst(prefix.count)))
        }
        return result.sorted()
    }

    /// Строковые литералы файла (обычные и `"""`), без комментариев.
    static func literals(in source: String) -> [String] {
        var result: [String] = []
        var index = source.startIndex
        func at(_ text: String) -> Bool { source[index...].hasPrefix(text) }
        while index < source.endIndex {
            if at("//") {
                index = source[index...].firstIndex(of: "\n") ?? source.endIndex
            } else if at("/*") {
                index = source[index...].range(of: "*/")?.upperBound ?? source.endIndex
            } else if at("\"\"\"") {
                let start = source.index(index, offsetBy: 3)
                let end = source[start...].range(of: "\"\"\"")
                let body = source[start..<(end?.lowerBound ?? source.endIndex)]
                result.append(String(body.drop { $0 == "\n" }))
                index = end?.upperBound ?? source.endIndex
            } else if at("\"") {
                var cursor = source.index(after: index)
                var body = ""
                while cursor < source.endIndex, source[cursor] != "\"", source[cursor] != "\n" {
                    if source[cursor] == "\\" {
                        let next = source.index(after: cursor)
                        guard next < source.endIndex else { break }
                        body.append(source[cursor])
                        body.append(source[next])
                        cursor = source.index(after: next)
                        continue
                    }
                    body.append(source[cursor])
                    cursor = source.index(after: cursor)
                }
                result.append(body)
                index = cursor < source.endIndex ? source.index(after: cursor) : cursor
            } else {
                index = source.index(after: index)
            }
        }
        return result
    }
}
