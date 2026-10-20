import DesignSystem
import SwiftUI

/// Над экраном с сохранёнными данными (`ios-offline-outbox`): без сети —
/// плашка «Нет подключения · Обновлено в 14:20»; с сетью, пока свежий ответ
/// не пришёл, — только подпись «Обновлено в 14:20».
struct FreshnessBanner: View {
    let offline: Bool
    let updatedLabel: String?

    var body: some View {
        if offline {
            OfflineBanner(updatedLabel: updatedLabel)
                .accessibilityIdentifier("banner.offline")
        } else if let updatedLabel {
            Text(updatedLabel)
                .dsText(DS.Typography.caption)
                .foregroundStyle(DS.Color.fgMuted)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityIdentifier("banner.updated")
        }
    }
}

/// «Нет сети и нет кэша»: понятное пустое состояние вместо вечной загрузки
/// или ошибки по кругу. Экран обновится сам, когда сеть появится.
struct OfflineEmptyView: View {
    var text = "Сохранённых данных пока нет. Экран обновится, когда появится сеть."

    var body: some View {
        VStack(spacing: DS.Space.s2) {
            Image(systemName: "wifi.slash")
                .font(.system(size: 28))
                .foregroundStyle(DS.Color.fgMuted)
                .accessibilityHidden(true)
            Text("Нет подключения").dsText(DS.Typography.title3).foregroundStyle(DS.Color.fgDefault)
            Text(text).dsText(DS.Typography.callout).foregroundStyle(DS.Color.fgMuted).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, DS.Space.s6)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("state.offlineEmpty")
    }
}
