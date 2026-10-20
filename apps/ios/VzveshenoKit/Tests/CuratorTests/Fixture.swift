import Foundation

/// JSON из `Fixtures/` — ответы сервера в том виде, в каком их отдаёт API.
func fixture(_ name: String) -> String {
    guard let url = Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Fixtures"),
          let text = try? String(contentsOf: url, encoding: .utf8) else { return "null" }
    return text
}
