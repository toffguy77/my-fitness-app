import DesignSystem
import Navigation
import SwiftUI

/// «Профиль» — аватар в шапке «Сегодня». Вкладки «Ещё» нет: всё, что в
/// ней было, — здесь. Разделы профиля и настроек (`ios-client-settings`)
/// добавляются сюда же.
struct ProfileScreen: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: DS.Space.s5) {
                HStack(spacing: DS.Space.s3) {
                    Text(verbatim: model.avatarInitial)
                        .font(.custom(DS.FontFamily.sans, size: 22, relativeTo: .title2).weight(.semibold))
                        .foregroundStyle(DS.Color.fgDefault)
                        .frame(width: 56, height: 56)
                        .background(Circle().fill(DS.Color.bgSubtle))
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 2) {
                        if let name = model.profileName, !name.isEmpty {
                            Text(name).dsText(DS.Typography.title3).foregroundStyle(DS.Color.fgDefault)
                        }
                        if let email = model.user?.email {
                            Text(email).dsText(DS.Typography.callout).foregroundStyle(DS.Color.fgMuted)
                        }
                    }
                }
                ProfileLinks()
            }
            .padding(.horizontal, DS.Space.screenX)
            .padding(.vertical, DS.Space.s4)
        }
        .background(DS.Color.bgCanvas)
        .navigationTitle("Профиль")
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier("screen.profile")
    }
}

private struct ProfileLinks: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        VStack(spacing: 0) {
            NavigationLink(value: Destination.health) {
                row(String(localized: "health.title"), "heart")
            }
            .accessibilityIdentifier("profile.health")
            Divider().overlay(DS.Color.lineDefault)
            #if DEV_BUILD
            Button { model.showCatalogue = true } label: {
                row("Компоненты", "paintpalette")
            }
            .accessibilityIdentifier("profile.catalogue")
            Divider().overlay(DS.Color.lineDefault)
            #endif
            Button { Task { await model.signOut() } } label: {
                row("Выйти", "rectangle.portrait.and.arrow.right")
            }
            .accessibilityIdentifier("profile.signOut")
        }
        .buttonStyle(.plain)
        .background(RoundedRectangle(cornerRadius: DS.Radius.l, style: .continuous).fill(DS.Color.bgSurface))
        .overlay(RoundedRectangle(cornerRadius: DS.Radius.l, style: .continuous).strokeBorder(DS.Color.lineDefault))
        #if DEBUG
        // Сценарий UI-теста: сколько раз подделка Здоровья получила системный
        // запрос — по нему тест видит, что «Не сейчас» запроса не делает.
        if let requests = model.uiTestHealthAuthorizationRequests {
            Text(verbatim: "health.authRequests=\(requests)")
                .dsText(DS.Typography.caption)
                .foregroundStyle(DS.Color.fgMuted)
                .accessibilityIdentifier("uitest.health.authRequests")
        }
        #endif
    }

    private func row(_ title: String, _ icon: String) -> some View {
        HStack(spacing: DS.Space.s3) {
            Image(systemName: icon).foregroundStyle(DS.Color.fgMuted).accessibilityHidden(true)
            Text(title).dsText(DS.Typography.body).foregroundStyle(DS.Color.fgDefault)
            Spacer()
            Image(systemName: "chevron.right").foregroundStyle(DS.Color.fgSubtle).accessibilityHidden(true)
        }
        .padding(.horizontal, DS.Space.s4)
        .frame(minHeight: 56)
        .contentShape(Rectangle())
    }
}
