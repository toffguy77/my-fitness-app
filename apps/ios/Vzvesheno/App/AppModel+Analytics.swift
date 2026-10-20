import API
import Foundation

/// Собственные события продукта (`ios-platform-compliance`): только в
/// `POST /api/v1/public/analytics/events`, только имена из словаря сервера
/// (`ProductEvent`). Сбой отправки не мешает работе.
extension AppModel {
    var analytics: AnalyticsClient {
        AnalyticsClient(api: api, visitorID: AnalyticsVisitor.id(in: preferences), appVersion: environment.version)
    }

    func track(_ name: String, _ properties: [String: String] = [:]) {
        let client = analytics
        Task { await client.send([AnalyticsClient.Event(name: name, properties: properties)]) }
    }

    /// После входа: события посетителя — этого аккаунта. Идентификатор,
    /// связанный с другим аккаунтом, перед этим заменяется новым.
    func identifyAnalytics(userID: Int64) {
        guard let visitor = AnalyticsVisitor.idToIdentify(userID: userID, in: preferences) else { return }
        let client = AnalyticsClient(api: api, visitorID: visitor, appVersion: environment.version)
        Task { await client.identify() }
    }
}
