import Foundation

public enum ServerAddress {
    public static let defaultAddress = "http://localhost:3000"
    public static func parse(_ input: String) -> URL? {
        guard let url = URL(string: input.trimmingCharacters(in: .whitespacesAndNewlines)),
              let scheme = url.scheme?.lowercased(), ["http", "https"].contains(scheme),
              let host = url.host, !host.isEmpty, url.user == nil, url.password == nil,
              url.query == nil, url.fragment == nil,
              url.path.isEmpty || url.path == "/" else { return nil }
        return url
    }
    public static func sameOrigin(_ left: URL, _ right: URL) -> Bool {
        func port(_ url: URL) -> Int { url.port ?? (url.scheme?.lowercased() == "https" ? 443 : 80) }
        return left.scheme?.lowercased() == right.scheme?.lowercased()
            && left.host?.lowercased() == right.host?.lowercased()
            && port(left) == port(right)
    }
}
