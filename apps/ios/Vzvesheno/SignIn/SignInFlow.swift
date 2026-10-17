import DesignSystem
import Session
import SwiftUI

/// Вход: форма, затем продолжение входа через провайдера, если сервер его
/// просит (согласия, почта, подтверждение паролем).
struct SignInFlow: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        switch model.signInStep {
        case .form:
            SignInView()
        case let .pending(pending):
            NavigationStack {
                switch pending.step {
                case .needsConsents:
                    ConsentsView(pending: pending)
                case .needsEmail:
                    EmailEntryView(pending: pending)
                case .needsLinkConfirmation:
                    LinkConfirmationView(pending: pending)
                }
            }
        case let .resetPassword(token):
            NavigationStack { ResetPasswordView(token: token) }
        }
    }
}

/// Поле ввода по правилам дизайн-системы: 48 pt, текст 16 pt.
struct DSField: View {
    let title: String
    @Binding var text: String
    var secure = false
    var contentType: UITextContentType?
    var keyboard: UIKeyboardType = .default

    var body: some View {
        VStack(alignment: .leading, spacing: DS.Space.s1) {
            Text(title)
                .dsText(DS.Typography.caption)
                .fontWeight(.medium)
                .foregroundStyle(DS.Color.fgMuted)
            Group {
                if secure {
                    SecureField(title, text: $text)
                } else {
                    TextField(title, text: $text)
                        .keyboardType(keyboard)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }
            }
            .textContentType(contentType)
            .dsText(DS.Typography.body)
            .padding(.horizontal, DS.Space.s4)
            .frame(minHeight: DS.Size.control)
            .background(RoundedRectangle(cornerRadius: DS.Radius.s, style: .continuous).fill(DS.Color.bgSurface))
            .overlay(RoundedRectangle(cornerRadius: DS.Radius.s, style: .continuous).strokeBorder(DS.Color.lineDefault))
        }
    }
}

/// Текст ошибки под формой.
struct ErrorText: View {
    let text: String?

    var body: some View {
        if let text {
            Text(text)
                .dsText(DS.Typography.caption)
                .foregroundStyle(DS.Color.statusDangerFg)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("signIn.error")
        }
    }
}

/// Отметки согласий: три обязательных и маркетинг по желанию.
struct ConsentsForm: View {
    @Environment(AppModel.self) private var model
    @Binding var consents: Consents

    var body: some View {
        VStack(alignment: .leading, spacing: DS.Space.s3) {
            toggle($consents.termsOfService, "Принимаю условия использования", link: model.config?.legal?.termsURL)
            toggle($consents.privacyPolicy, "Принимаю политику конфиденциальности", link: model.config?.legal?.privacyURL)
            toggle($consents.dataProcessing, "Согласен на обработку персональных данных, включая данные о здоровье", link: nil)
            toggle($consents.marketing, "Хочу получать новости и советы (по желанию)", link: nil)
        }
    }

    private func toggle(_ value: Binding<Bool>, _ title: String, link: String?) -> some View {
        Toggle(isOn: value) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).dsText(DS.Typography.callout).foregroundStyle(DS.Color.fgDefault)
                if let link, let url = URL(string: link) {
                    Link("Открыть документ", destination: url)
                        .dsText(DS.Typography.caption)
                }
            }
        }
        .toggleStyle(.switch)
        .tint(DS.Color.primaryDefault)
    }
}
