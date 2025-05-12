// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "TinyFlag",
    platforms: [.iOS(.v14), .macOS(.v12), .watchOS(.v7), .tvOS(.v14)],
    products: [
        .library(name: "TinyFlag", targets: ["TinyFlag"]),
    ],
    targets: [
        .target(
            name: "TinyFlag",
            path: "Sources/TinyFlag"
        ),
        .testTarget(
            name: "TinyFlagTests",
            dependencies: ["TinyFlag"],
            path: "Tests/TinyFlagTests",
            resources: [.copy("test-vectors.json")]
        ),
    ]
)
