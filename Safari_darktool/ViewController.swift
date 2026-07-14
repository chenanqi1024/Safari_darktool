//
//  ViewController.swift
//  Safari_darktool
//
//  Created by chenanqi on 2026/7/14.
//

import Cocoa
import SafariServices
import WebKit

let extensionBundleIdentifier = "aicode.qqq.Safari-darktool.Extension"

class ViewController: NSViewController, WKNavigationDelegate, WKScriptMessageHandler {

    @IBOutlet var webView: WKWebView!

    override func viewDidLoad() {
        super.viewDidLoad()

        self.webView.navigationDelegate = self

        self.webView.configuration.userContentController.add(self, name: "controller")

        self.webView.loadFileURL(Bundle.main.url(forResource: "Main", withExtension: "html")!, allowingReadAccessTo: Bundle.main.resourceURL!)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        SFSafariExtensionManager.getStateOfSafariExtension(withIdentifier: extensionBundleIdentifier) { (state, error) in
            DispatchQueue.main.async {
                if #available(macOS 13, *) {
                    webView.evaluateJavaScript(self.statusScript(for: state, error: error, useSettings: true))
                } else {
                    webView.evaluateJavaScript(self.statusScript(for: state, error: error, useSettings: false))
                }
            }
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? String, body == "open-preferences" else {
            return
        }

        SFSafariApplication.showPreferencesForExtension(withIdentifier: extensionBundleIdentifier) { error in
            DispatchQueue.main.async {
                if let error = error {
                    self.webView.evaluateJavaScript(self.preferenceErrorScript(for: error))
                }
            }
        }
    }

    private func statusScript(for state: SFSafariExtensionState?, error: Error?, useSettings: Bool) -> String {
        if let error = error {
            return "show(null, \(useSettings), \(Self.javascriptString(error.localizedDescription)))"
        }

        guard let state = state else {
            return "show(null, \(useSettings), null)"
        }

        return "show(\(state.isEnabled), \(useSettings), null)"
    }

    private func preferenceErrorScript(for error: Error) -> String {
        return "showPreferenceError(\(Self.javascriptString(error.localizedDescription)))"
    }

    private static func javascriptString(_ value: String) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed]),
              let encoded = String(data: data, encoding: .utf8) else {
            return "null"
        }

        return encoded
    }

}
