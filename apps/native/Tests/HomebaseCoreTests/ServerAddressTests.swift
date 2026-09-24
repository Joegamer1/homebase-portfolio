import XCTest
@testable import HomebaseCore
final class ServerAddressTests: XCTestCase {
    func testOnlyCredentialFreeServerOriginsAreAccepted() {
        XCTAssertNotNil(ServerAddress.parse("http://localhost:3000"))
        XCTAssertNotNil(ServerAddress.parse("https://homebase.example/"))
        for input in ["file:///etc/passwd", "javascript:alert(1)", "https://user:secret@example.com", "https://example.com/career", "https://example.com?token=secret"] {
            XCTAssertNil(ServerAddress.parse(input))
        }
    }
    func testOriginIncludesSchemeHostAndEffectivePort() {
        let base = URL(string: "https://homebase.example")!
        XCTAssertTrue(ServerAddress.sameOrigin(base, URL(string: "https://homebase.example:443/career")!))
        XCTAssertFalse(ServerAddress.sameOrigin(base, URL(string: "http://homebase.example")!))
        XCTAssertFalse(ServerAddress.sameOrigin(base, URL(string: "https://homebase.example:3000")!))
        XCTAssertFalse(ServerAddress.sameOrigin(base, URL(string: "https://employer.example")!))
    }
}
