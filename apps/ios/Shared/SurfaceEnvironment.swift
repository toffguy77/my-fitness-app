import API
import Foundation
import Navigation
import Outbox
import Session
import Surfaces

/// Снимок, очередь и сессия для виджетов, Пункта управления и App Intents —
/// одинаково в приложении и в расширении (файл собирается в обе цели).
///
/// Всё — из Info.plist цели (`project.yml`): у расширения свой bundle id
/// (`….widget`), поэтому имя записи Keychain берётся из `AppBundleID`, а не
/// из `Bundle.main.bundleIdentifier`, иначе расширение искало бы сессию не
/// там и считало бы, что никто не вошёл.
enum SurfaceEnvironment {
    private static var info: [String: Any] { Bundle.main.infoDictionary ?? [:] }

    static var directory: URL {
        ProtectedFiles.directory(appGroup: info["AppGroupID"] as? String)
    }

    static var snapshots: SnapshotRepository {
        SnapshotRepository(directory: directory)
    }

    static var routes: PendingRouteStore {
        PendingRouteStore(directory: directory)
    }

    static var session: SharedSessionReader {
        let bundleID = info["AppBundleID"] as? String ?? "team.burcev.app"
        let group = (info["KeychainAccessGroup"] as? String).flatMap { $0.isEmpty || $0.hasPrefix(".") ? nil : $0 }
        return SharedSessionReader(secure: KeychainStore(policy: KeychainPolicy(service: "\(bundleID).session", accessGroup: group)))
    }

    /// Адрес сайта для ссылок виджета: `Router` принимает только свои хосты.
    static var siteURL: URL {
        let raw = info["APIBaseURL"] as? String ?? "https://burcev.team"
        return URL(string: raw) ?? URL(fileURLWithPath: "/")
    }

    static func link(_ path: String, query: [URLQueryItem] = []) -> URL {
        var components = URLComponents(url: siteURL, resolvingAgainstBaseURL: false)
        components?.path = path
        components?.queryItems = query.isEmpty ? nil : query
        return components?.url ?? siteURL
    }

    /// Контекст действия: клиент API с токеном из Keychain без обновления и
    /// очередь в общем файле SQLite.
    static func context() async -> SurfaceContext {
        let reader = session
        let version = info["CFBundleShortVersionString"] as? String ?? "0"
        let build = info["CFBundleVersion"] as? String ?? "0"
        let api = APIClient(baseURL: siteURL, clientHeader: "ios/\(version)/\(build)")
        await api.setTokenProvider(ReadOnlyTokenProvider(reader: reader))
        let store: OutboxStore = (try? SQLiteOutboxStore(url: directory.appendingPathComponent("outbox.sqlite")))
            ?? InMemoryOutboxStore()
        return SurfaceContext(snapshots: snapshots, outbox: Outbox(store: store, api: api), reloader: WidgetCenterReloader(),
                              sessionUser: { reader.user })
    }
}

/// Экран, который просит открыть интент или элемент Пункта управления.
///
/// В приложении, где модель уже готова, маршрут открывается сразу; иначе
/// (расширение, холодный запуск) — файл в App Group, который приложение
/// забирает при запуске и выходе на передний план.
@MainActor
enum SurfaceRouting {
    static var handler: (@MainActor (IntentRoute) -> Void)?

    static func request(_ route: IntentRoute) {
        if let handler {
            handler(route)
        } else {
            SurfaceEnvironment.routes.save(route)
        }
    }
}
