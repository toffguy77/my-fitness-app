import API
import Client
import Foundation
import Navigation
import Session

// Universal link, `target` пуша и вход по ссылке (`ios-deep-links`).
extension AppModel {
    // MARK: Ссылки

    /// Universal link: ссылки входа — без сессии, экраны — после входа.
    func open(_ url: URL) async {
        guard let link = Router.parse(url) else { return }
        switch link {
        case let .auth(authLink):
            // Не `user`: при холодном запуске по ссылке restore() ещё не
            // прошёл, и сессия есть только в Keychain.
            let hasSession = await session.hasStoredSession()
            switch AuthLinkDecision.decide(authLink, hasSession: hasSession) {
            case .handle:
                await handle(authLink)
            case .confirmSwitchingAccount:
                authLinkAwaitingConfirmation = authLink
            }
        case let .screen(screen):
            open(screen)
        }
    }

    /// Человек подтвердил вход в другой аккаунт: текущий сеанс завершается,
    /// затем ссылка обрабатывается.
    func confirmSwitchingAccount() async {
        guard let link = authLinkAwaitingConfirmation else { return }
        authLinkAwaitingConfirmation = nil
        await signOut()
        user = nil
        recompute()
        await handle(link)
    }

    func cancelSwitchingAccount() {
        authLinkAwaitingConfirmation = nil
    }

    func handle(_ link: AuthLink) async {
        switch link {
        case let .magicLink(token):
            do {
                try await complete(try await auth.consumeMagicLink(token: token))
            } catch APIError.server(_, .some("token_invalid"), _) {
                // Просроченная, использованная и поддельная ссылка сервер не
                // различает — для человека это одно: «Ссылка устарела».
                signInStep = .linkExpired
            } catch {
                linkError = messages.message(for: error)
            }
        case let .resetPassword(token):
            signInStep = .resetPassword(token: token)
        case let .providerComplete(code, reason):
            guard let code else {
                linkError = Self.providerFailureMessage(reason)
                return
            }
            do {
                try await finishProviderSignIn(code: code)
            } catch {
                linkError = messages.message(for: error)
            }
        }
    }

    /// `target` пуша.
    func open(_ target: PushTarget) {
        open(Router.link(for: target))
    }

    func open(_ link: ScreenLink) {
        guard case let .shell(shell, _) = launch else {
            Task { await pendingLinks.remember(link) }
            return
        }
        if shell == .client, openFoodTracker(link) { return }
        if shell == .client, case let .dashboard(task) = link {
            // «Сегодня» с подсвеченной задачей — корень вкладки, а не экран поверх.
            selectedTab = .today
            paths[.today] = []
            highlightedTask = task
            return
        }
        let target = Router.target(for: link, shell: shell)
        selectedTab = target.tab
        if let tab = target.tab {
            paths[tab] = target.path
        }
    }
}
