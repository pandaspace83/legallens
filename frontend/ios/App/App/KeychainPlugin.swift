import Capacitor
import Foundation
import LocalAuthentication
import Security

// Keeps the session token in the iOS Keychain (AS-4.2, DEC-104), behind Face ID (AS-4.2b, DEC-107).
//
// - Reading the token needs the device owner: Face ID, or the device passcode if Face ID fails or is off. The read
//   happens once, at launch, so opening the app asks for Face ID before anything loads.
// - Writing and deleting do not prompt.
// - The item exists only while the iPhone has a passcode (WhenPasscodeSetThisDeviceOnly): it is never in a backup,
//   never synced to iCloud, and iOS deletes it if the passcode is removed. With no passcode the token is not saved
//   at all, so the lawyer signs in on every launch: an unlocked phone must not open client matters.
// - A cancelled or failed Face ID resolves with no token and `canceled: true`; the app shows the sign-in screen and
//   the saved token stays, so the next launch asks again.
@objc(KeychainPlugin)
public class KeychainPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "KeychainPlugin"
    public let jsName = "Keychain"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
    ]

    private let service = "com.newpandaworld.legallens.session.v2"
    // AS-4.2a stored the token without the Face ID guard. It is deleted, never read, so no unguarded copy survives.
    private let legacyService = "com.newpandaworld.legallens.session"

    private func query(_ key: String, service: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
    }

    private func removeLegacy(_ key: String) {
        SecItemDelete(query(key, service: legacyService) as CFDictionary)
    }

    @objc func get(_ call: CAPPluginCall) {
        guard let key = call.getString("key") else { return call.reject("key is required") }
        removeLegacy(key)
        let context = LAContext()
        context.localizedReason = "Unlock your LegalLens sign-in"
        var q = query(key, service: service)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        q[kSecUseAuthenticationContext as String] = context
        // SecItemCopyMatching waits while the Face ID prompt is up, so it stays off the main thread.
        DispatchQueue.global(qos: .userInitiated).async {
            var item: CFTypeRef?
            let status = SecItemCopyMatching(q as CFDictionary, &item)
            switch status {
            case errSecSuccess:
                guard let data = item as? Data, let value = String(data: data, encoding: .utf8) else {
                    return call.reject("Keychain item unreadable")
                }
                call.resolve(["value": value])
            case errSecItemNotFound:
                call.resolve(["value": NSNull()])
            case errSecUserCanceled, errSecAuthFailed:
                call.resolve(["value": NSNull(), "canceled": true])
            default:
                call.reject("Keychain read failed (\(status))")
            }
        }
    }

    @objc func set(_ call: CAPPluginCall) {
        guard let key = call.getString("key"), let value = call.getString("value") else {
            return call.reject("key and value are required")
        }
        removeLegacy(key)
        SecItemDelete(query(key, service: service) as CFDictionary)
        // No passcode means no Face ID either, and no protection for a saved session: keep it in memory only.
        guard LAContext().canEvaluatePolicy(.deviceOwnerAuthentication, error: nil) else {
            return call.reject("Set a passcode on this iPhone to stay signed in", "no_passcode")
        }
        var error: Unmanaged<CFError>?
        guard let access = SecAccessControlCreateWithFlags(
            nil, kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly, .userPresence, &error
        ) else {
            return call.reject("Keychain access control unavailable")
        }
        var q = query(key, service: service)
        q[kSecValueData as String] = Data(value.utf8)
        q[kSecAttrAccessControl as String] = access
        let status = SecItemAdd(q as CFDictionary, nil)
        if status == errSecSuccess { call.resolve() } else { call.reject("Keychain write failed (\(status))") }
    }

    @objc func remove(_ call: CAPPluginCall) {
        guard let key = call.getString("key") else { return call.reject("key is required") }
        removeLegacy(key)
        let status = SecItemDelete(query(key, service: service) as CFDictionary)
        if status == errSecSuccess || status == errSecItemNotFound { call.resolve() } else {
            call.reject("Keychain delete failed (\(status))")
        }
    }
}
