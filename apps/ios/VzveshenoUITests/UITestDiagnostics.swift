import XCTest

extension XCUIApplication {
    /// Что сейчас на экране — одной строкой для сообщения о провале: в журнале
    /// CI остаются только строки с «error:».
    var screenSummary: String {
        let texts = staticTexts.allElementsBoundByIndex.prefix(25).map { $0.identifier.isEmpty ? $0.label : $0.identifier }
        let buttons = buttons.allElementsBoundByIndex.prefix(25).map { $0.identifier.isEmpty ? $0.label : $0.identifier }
        let line = "тексты: \(texts.joined(separator: " | ")) ; кнопки: \(buttons.joined(separator: " | "))"
        return line.replacingOccurrences(of: "\n", with: " ")
    }
}
