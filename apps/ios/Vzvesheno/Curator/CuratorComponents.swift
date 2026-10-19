import Curator
import DesignSystem
import SwiftUI

/// Шапка вкладки куратора: заголовок засечками и справа — своё (аватар,
/// счётчик). Системная панель навигации на корнях вкладок скрыта, как у клиента.
struct CuratorTitle<Trailing: View>: View {
    let title: String
    @ViewBuilder var trailing: Trailing

    var body: some View {
        HStack(alignment: .center, spacing: DS.Space.s2) {
            Text(title)
                .dsText(DS.Typography.display)
                .foregroundStyle(DS.Color.fgDefault)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: 0)
            trailing
        }
    }
}

/// Круг с инициалами: «МК».
struct InitialsAvatar: View {
    let name: String
    var size: CGFloat = 40

    var body: some View {
        Text(verbatim: CuratorText.initials(name))
            .font(.custom(DS.FontFamily.sans, size: size * 0.36, relativeTo: .headline).weight(.semibold))
            .foregroundStyle(DS.Color.fgDefault)
            .frame(width: size, height: size)
            .background(Circle().fill(DS.Color.bgSubtle))
            .accessibilityHidden(true)
    }
}

/// Плашка-бейдж: причина внимания, статус.
struct CuratorBadge: View {
    let text: String
    let tone: BadgeTone

    var body: some View {
        Text(text)
            .dsText(DS.Typography.micro)
            .foregroundStyle(foreground)
            .padding(.horizontal, 7)
            .padding(.vertical, 2)
            .background(Capsule().fill(background))
            .fixedSize(horizontal: false, vertical: true)
    }

    private var foreground: Color {
        switch tone {
        case .danger: return DS.Color.statusDangerFg
        case .warning: return DS.Color.statusWarningFg
        case .info: return DS.Color.statusInfoFg
        case .neutral: return DS.Color.fgMuted
        // Тёмный оттенок действия: основной на мягкой подложке мелким кеглем
        // аудит контраста не проходит.
        case .accent: return DS.Color.primaryHover
        }
    }

    private var background: Color {
        switch tone {
        case .danger: return DS.Color.statusDangerSoft
        case .warning: return DS.Color.statusWarningSoft
        case .info: return DS.Color.statusInfoSoft
        case .neutral: return DS.Color.bgSubtle
        case .accent: return DS.Color.primarySoft
        }
    }
}

/// Сегменты-вкладки, как на макетах: «Обзор / План / Задачи / Отчёты», приёмы пищи.
struct SegmentBar<Item: Hashable>: View {
    let items: [Item]
    @Binding var selection: Item
    let title: (Item) -> String
    var identifier: (Item) -> String = { "\($0)" }

    var body: some View {
        HStack(spacing: 0) {
            ForEach(items, id: \.self) { item in
                let selected = item == selection
                Button { selection = item } label: {
                    Text(title(item))
                        .font(.custom(DS.FontFamily.sans, size: 13, relativeTo: .footnote).weight(.medium))
                        .foregroundStyle(selected ? DS.Color.fgDefault : DS.Color.fgMuted)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                        .frame(maxWidth: .infinity, minHeight: 18)
                        .padding(.vertical, 7)
                        .background {
                            if selected {
                                RoundedRectangle(cornerRadius: DS.Radius.s, style: .continuous)
                                    .fill(DS.Color.bgSurface)
                                    .shadow(color: DS.Color.bgScrim.opacity(0.4), radius: 2, y: 1)
                            }
                        }
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(selected ? .isSelected : [])
                .accessibilityIdentifier("segment.\(identifier(item))")
            }
        }
        .padding(3)
        .background(RoundedRectangle(cornerRadius: DS.Radius.s + 2, style: .continuous).fill(DS.Color.bgSubtle))
    }
}

/// Карточка экрана куратора — та же бумага с линией, что «Сегодня» у клиента.
struct CuratorCard<Content: View>: View {
    var padding = EdgeInsets(top: DS.Space.s3, leading: 14, bottom: DS.Space.s3, trailing: 14)
    @ViewBuilder var content: Content

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: DS.Radius.l, style: .continuous)
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(shape.fill(DS.Color.bgSurface))
            .overlay(shape.strokeBorder(DS.Color.lineDefault, lineWidth: 1))
    }
}

/// «Не удалось загрузить данные» с «Повторить».
struct LoadFailedView: View {
    var text = "Не удалось загрузить данные"
    let retry: () -> Void

    var body: some View {
        VStack(spacing: DS.Space.s4) {
            Text(text)
                .dsText(DS.Typography.body)
                .foregroundStyle(DS.Color.fgMuted)
                .multilineTextAlignment(.center)
                .accessibilityIdentifier("curator.loadFailed")
            Button("Повторить", action: retry)
                .buttonStyle(DSButtonStyle(.secondary, size: .medium))
                .accessibilityIdentifier("curator.retry")
        }
        .padding(DS.Space.screenX)
        .frame(maxWidth: .infinity)
    }
}

/// Аватар в шапке вкладок куратора и суперадмина: почта, раздел веба,
/// справочник (Dev) и выход. Контент и админка остаются в вебе.
struct CuratorProfileMenu: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        Menu {
            if let email = model.user?.email {
                Text(email)
            }
            if model.curator?.shell == .admin {
                Link("Админка — в веб-версии", destination: model.webURL("admin"))
                    .accessibilityIdentifier("profile.webAdmin")
            } else {
                Link("Статьи — в веб-версии", destination: model.webURL("curator/content"))
                    .accessibilityIdentifier("profile.webContent")
            }
            #if DEV_BUILD
            Button("Компоненты") { model.showCatalogue = true }
                .accessibilityIdentifier("profile.catalogue")
            #endif
            Button("Выйти", role: .destructive) { Task { await model.signOut() } }
                .accessibilityIdentifier("profile.signOut")
        } label: {
            ProfileAvatar(initial: initial)
        }
        .accessibilityLabel("Профиль")
        .accessibilityIdentifier("header.profile")
    }

    private var initial: String {
        let source = model.profileName ?? model.user?.name ?? model.user?.email ?? "?"
        return source.first.map { String($0).uppercased() } ?? "?"
    }
}

/// Круг с первой буквой имени — кнопка профиля в шапке.
struct ProfileAvatar: View {
    let initial: String

    var body: some View {
        Text(verbatim: initial)
            .font(.custom(DS.FontFamily.sans, size: 15, relativeTo: .headline).weight(.semibold))
            .foregroundStyle(DS.Color.fgDefault)
            .frame(width: DS.Size.touch, height: DS.Size.touch)
            .background(Circle().fill(DS.Color.bgSubtle))
    }
}
