import Foundation
#if canImport(CoreText)
import CoreText
#endif

extension DS {
    /// Ресурсы модуля: каталог цветов, шрифты, склонения.
    public static var bundle: Bundle { .module }

    /// Шрифты бренда — переменные Literata и Golos Text (OFL, лицензии рядом в
    /// `Fonts/`). `UIAppFonts` до ресурсов пакета не дотягивается, поэтому
    /// приложение и расширение регистрируют их сами при запуске.
    public enum Fonts {
        /// Файлы шрифтов в ресурсах модуля.
        public static let files = ["Literata.ttf", "Literata-Italic.ttf", "GolosText.ttf"]

        /// URL файлов шрифтов в ресурсах модуля.
        public static var urls: [URL] {
            files.compactMap { name in
                Bundle.module.url(forResource: name, withExtension: nil, subdirectory: "Fonts")
                    ?? Bundle.module.url(forResource: name, withExtension: nil)
            }
        }

        #if canImport(CoreText)
        private static let registration: Bool = {
            var ok = true
            for url in urls {
                var error: Unmanaged<CFError>?
                if !CTFontManagerRegisterFontsForURL(url as CFURL, .process, &error) {
                    // Повторная регистрация — не ошибка.
                    let code = error.map { CFErrorGetCode($0.takeRetainedValue()) }
                    if code != CTFontManagerError.alreadyRegistered.rawValue { ok = false }
                }
            }
            return ok && urls.count == files.count
        }()

        /// Регистрирует шрифты один раз на процесс. `false` — какой-то файл не нашёлся.
        @discardableResult
        public static func register() -> Bool {
            registration
        }
        #endif
    }
}
