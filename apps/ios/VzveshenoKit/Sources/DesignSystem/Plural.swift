import Foundation

extension DS {
    /// Числа со словами из String Catalog `Strings/Plurals.xcstrings` с формами
    /// `one`, `few`, `many`, `other` (`ios-platform-compliance`).
    ///
    /// Каталог читается здесь, а не компилируется Xcode: выбор формы тогда не
    /// зависит от языка симулятора или устройства, и склонение проверяется
    /// теми же тестами на Linux.
    public enum Plural {
        /// «ждёт 21 день» для `format("plural.waiting_days %lld", 21)`.
        ///
        /// `numberText` — число, уже записанное вызывающим (неразрывный пробел
        /// между разрядами одинаков на всех системах, а у `grouped` — нет).
        public static func format(_ key: String, _ number: Int, language: String = "ru", numberText: String? = nil) -> String {
            let forms = catalog[key]?[language] ?? catalog[key]?["ru"] ?? [:]
            let category = Self.category(number, language: language)
            let template = forms[category] ?? forms["other"] ?? key
            return template.replacingOccurrences(of: "%lld", with: numberText ?? grouped(number))
        }

        /// Категория CLDR: для русского — one, few, many.
        public static func category(_ number: Int, language: String = "ru") -> String {
            let value = abs(number)
            guard language == "ru" else { return value == 1 ? "one" : "other" }
            let mod10 = value % 10
            let mod100 = value % 100
            if mod10 == 1 && mod100 != 11 { return "one" }
            if (2...4).contains(mod10) && !(12...14).contains(mod100) { return "few" }
            return "many"
        }

        /// Число с разделителем разрядов, как его пишет русская локаль: «2 472».
        public static func grouped(_ number: Int) -> String {
            let formatter = NumberFormatter()
            formatter.locale = Locale(identifier: "ru_RU")
            formatter.numberStyle = .decimal
            formatter.usesGroupingSeparator = true
            return formatter.string(from: NSNumber(value: number)) ?? String(number)
        }

        /// Ключ → язык → форма → шаблон.
        static let catalog: [String: [String: [String: String]]] = {
            guard let url = Bundle.module.url(forResource: "Plurals", withExtension: "xcstrings", subdirectory: "Strings")
                    ?? Bundle.module.url(forResource: "Plurals", withExtension: "xcstrings"),
                  let data = try? Data(contentsOf: url),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let strings = json["strings"] as? [String: Any] else {
                return [:]
            }
            var result: [String: [String: [String: String]]] = [:]
            for (key, entry) in strings {
                let localizations = (entry as? [String: Any])?["localizations"] as? [String: Any] ?? [:]
                for (language, body) in localizations {
                    let plural = ((body as? [String: Any])?["variations"] as? [String: Any])?["plural"] as? [String: Any] ?? [:]
                    var forms: [String: String] = [:]
                    for (form, unit) in plural {
                        if let value = ((unit as? [String: Any])?["stringUnit"] as? [String: Any])?["value"] as? String {
                            forms[form] = value
                        }
                    }
                    result[key, default: [:]][language] = forms
                }
            }
            return result
        }()
    }
}
