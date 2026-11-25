// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "Scream",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(name: "Scream", targets: ["Scream"])
    ],
    targets: [
        .executableTarget(
            name: "Scream",
            path: "Sources/Scream",
            linkerSettings: [
                .linkedFramework("AppKit"),
                .linkedFramework("WebKit"),
                .linkedFramework("CoreGraphics"),
                .linkedFramework("ServiceManagement")
            ]
        )
    ]
)
