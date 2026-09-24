// swift-tools-version: 5.9
import PackageDescription
let package = Package(
    name: "Homebase",
    platforms: [.macOS(.v13), .iOS(.v16)],
    products: [.executable(name: "Homebase", targets: ["Homebase"])],
    targets: [
        .target(name: "HomebaseCore"),
        .executableTarget(name: "Homebase", dependencies: ["HomebaseCore"]),
        .testTarget(name: "HomebaseCoreTests", dependencies: ["HomebaseCore"])
    ]
)
