import SwiftUI
import WebKit
#if canImport(HomebaseCore)
import HomebaseCore
#endif
#if os(macOS)
import AppKit
#else
import UIKit
#endif

@main
struct HomebaseApp: App {
    var body: some Scene {
        WindowGroup { HomebaseView() }
        #if os(macOS)
        .defaultSize(width: 1200, height: 850)
        #endif
    }
}

@MainActor
final class BrowserModel: NSObject, ObservableObject, WKNavigationDelegate, WKUIDelegate {
    @Published var error: String?
    @Published var loading = false
    @Published var canGoBack = false
    let webView = WKWebView(frame: .zero)
    private var origin: URL?
    override init() {
        super.init()
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
    }
    func load(_ address: String) {
        guard let url = ServerAddress.parse(address) else {
            error = "Enter a server address such as http://localhost:3000."
            return
        }
        origin = url
        error = nil
        webView.load(URLRequest(url: url))
    }
    func reload() {
        error = nil
        if webView.url == nil, let origin { webView.load(URLRequest(url: origin)) }
        else { webView.reload() }
    }
    private func openExternal(_ url: URL) {
        guard ["https", "http", "mailto"].contains(url.scheme?.lowercased() ?? "") else { return }
        #if os(macOS)
        NSWorkspace.shared.open(url)
        #else
        UIApplication.shared.open(url)
        #endif
    }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if action.targetFrame?.isMainFrame != false,
           let origin, !ServerAddress.sameOrigin(url, origin) {
            if action.navigationType == .linkActivated { openExternal(url) }
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if action.targetFrame == nil, let url = action.request.url { openExternal(url) }
        return nil
    }
    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) { loading = true; error = nil }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { loading = false; canGoBack = webView.canGoBack }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError failure: Error) { failed(failure) }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError failure: Error) { failed(failure) }
    private func failed(_ failure: Error) {
        if (failure as NSError).code == NSURLErrorCancelled { return }
        loading = false
        error = "Cannot reach Homebase. Check that Tailscale is connected and your server is running. \(failure.localizedDescription)"
    }
}

struct HomebaseView: View {
    @AppStorage("homebase.serverAddress") private var serverAddress = ServerAddress.defaultAddress
    @StateObject private var browser = BrowserModel()
    @State private var settings = false
    @State private var draft = ""
    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button { browser.webView.goBack() } label: { Image(systemName: "chevron.left") }.disabled(!browser.canGoBack).accessibilityLabel("Back")
                Button { browser.reload() } label: { Image(systemName: "arrow.clockwise") }.accessibilityLabel("Reload")
                Text("HOMEBASE").font(.headline)
                Spacer()
                if browser.loading { ProgressView().controlSize(.small) }
                Button("Server") { draft = serverAddress; settings = true }
            }.padding(12)
            if let error = browser.error {
                VStack(spacing: 12) {
                    Image(systemName: "network.slash").font(.largeTitle)
                    Text(error).multilineTextAlignment(.center)
                    Button("Try again") { browser.reload() }
                }.padding(24).frame(maxWidth: .infinity)
            }
            BrowserView(webView: browser.webView)
        }
        .onAppear { if browser.webView.url == nil { browser.load(serverAddress) } }
        .sheet(isPresented: $settings) {
            VStack(alignment: .leading, spacing: 16) {
                Text("Homebase server").font(.title2)
                Text("Use your private server address. Tailscale must be connected when you are away from home.")
                TextField("Server URL", text: $draft).textFieldStyle(.roundedBorder)
                if ServerAddress.parse(draft) == nil { Text("Use an http or https address without a path, username or password.").foregroundColor(.red) }
                HStack {
                    Button("Cancel") { settings = false }
                    Spacer()
                    Button("Connect") { serverAddress = draft.trimmingCharacters(in: .whitespacesAndNewlines); browser.load(serverAddress); settings = false }
                        .disabled(ServerAddress.parse(draft) == nil)
                }
            }.padding(24).frame(minWidth: 300, idealWidth: 450)
        }
    }
}
#if os(macOS)
struct BrowserView: NSViewRepresentable {
    let webView: WKWebView
    func makeNSView(context: Context) -> WKWebView { webView }
    func updateNSView(_ view: WKWebView, context: Context) {}
}
#else
struct BrowserView: UIViewRepresentable {
    let webView: WKWebView
    func makeUIView(context: Context) -> WKWebView { webView }
    func updateUIView(_ view: WKWebView, context: Context) {}
}
#endif
