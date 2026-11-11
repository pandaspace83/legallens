import Capacitor

// Capacitor finds plugins from npm packages on its own; the ones written in this project are registered here.
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(KeychainPlugin())
    }
}
