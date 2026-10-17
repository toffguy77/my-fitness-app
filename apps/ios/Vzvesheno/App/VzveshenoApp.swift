import DesignSystem
import SwiftUI

@main
struct VzveshenoApp: App {
    init() {
        DS.Fonts.register()
    }

    var body: some Scene {
        WindowGroup {
            Text("Взвешено")
                .font(DS.Typography.title1.font)
                .foregroundStyle(DS.Color.fgDefault)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(DS.Color.bgCanvas)
        }
    }
}
