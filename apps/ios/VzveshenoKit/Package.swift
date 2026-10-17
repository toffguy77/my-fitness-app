// swift-tools-version:6.0
//
// Общие модули приложения «Взвешено» и его расширений.
//
// Ядро каждого модуля — на Foundation и проверяется `swift test` и на Linux
// (Docker, см. apps/ios/README.md). Адаптеры к Keychain, SwiftUI, Network,
// BackgroundTasks и WidgetKit — под `#if canImport(...)` за протоколами; их
// тесты идут только на симуляторе в CI.
import PackageDescription

// SQLite на Apple-платформах — системный модуль SQLite3; на Linux его даёт
// libsqlite3-dev через модуль CSQLite. Цель объявляется только там, где нужна.
#if os(Linux)
let sqliteTargets: [Target] = [
    .systemLibrary(name: "CSQLite", path: "Sources/CSQLite", pkgConfig: "sqlite3",
                   providers: [.apt(["libsqlite3-dev"])]),
]
let outboxDependencies: [Target.Dependency] = ["API", "CSQLite"]
#else
let sqliteTargets: [Target] = []
let outboxDependencies: [Target.Dependency] = ["API"]
#endif

// Каталоги цветов обрабатывает actool, которого на Linux нет: там DesignSystem
// собирается без ресурсов (SwiftUI там всё равно недоступен).
#if os(Linux)
let designSystemResources: [Resource] = [
    .copy("Fonts"),
]
#else
let designSystemResources: [Resource] = [
    .process("Generated/Colors.xcassets"),
    .copy("Fonts"),
    .process("Localizable.xcstrings"),
]
#endif

#if os(Linux)
let apiResources: [Resource] = [.copy("Localizable.xcstrings")]
#else
let apiResources: [Resource] = [.process("Localizable.xcstrings")]
#endif

let strictSwift: [SwiftSetting] = [
    .swiftLanguageMode(.v6),
]

let package = Package(
    name: "VzveshenoKit",
    defaultLocalization: "ru",
    platforms: [.iOS(.v18), .macOS(.v15)],
    products: [
        .library(name: "DesignSystem", targets: ["DesignSystem"]),
        .library(name: "API", targets: ["API"]),
        .library(name: "Session", targets: ["Session"]),
        .library(name: "Outbox", targets: ["Outbox"]),
        .library(name: "Navigation", targets: ["Navigation"]),
    ],
    targets: sqliteTargets + [
        // Токены — сгенерированный packages/design-tokens/dist/ios по ссылке
        // Generated → ../../../../../packages/design-tokens/dist/ios, а не копия.
        .target(
            name: "DesignSystem",
            exclude: linuxExcludes(["Localizable.xcstrings", "Generated/Colors.xcassets"]),
            resources: designSystemResources,
            swiftSettings: strictSwift
        ),
        .target(name: "API", resources: apiResources, swiftSettings: strictSwift),
        .target(name: "Session", dependencies: ["API"], swiftSettings: strictSwift),
        .target(name: "Outbox", dependencies: outboxDependencies, swiftSettings: strictSwift),
        .target(name: "Navigation", swiftSettings: strictSwift),

        // Заглушки транспорта и пути к файлам репозитория — общие для тестов.
        .target(name: "TestSupport", dependencies: ["API"], path: "Tests/TestSupport", swiftSettings: strictSwift),

        .testTarget(name: "DesignSystemTests", dependencies: ["DesignSystem", "TestSupport"],
                    exclude: ["__Snapshots__"], swiftSettings: strictSwift),
        .testTarget(name: "APITests", dependencies: ["API", "TestSupport"], swiftSettings: strictSwift),
        .testTarget(name: "SessionTests", dependencies: ["Session", "API", "TestSupport"], swiftSettings: strictSwift),
        .testTarget(name: "OutboxTests", dependencies: ["Outbox", "API", "TestSupport"], swiftSettings: strictSwift),
        .testTarget(name: "NavigationTests", dependencies: ["Navigation", "TestSupport"], swiftSettings: strictSwift),
    ]
)

/// Файлы, которые на Linux не нужны вовсе (String Catalog без SwiftUI-клиента).
func linuxExcludes(_ paths: [String]) -> [String] {
    #if os(Linux)
    return paths
    #else
    return []
    #endif
}
