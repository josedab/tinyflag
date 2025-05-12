import Foundation

/// A single targeting rule applied to a flag.
public struct Rule: Codable {
    public let conditions: [String: AnyCodable]
    public let enabled: Bool?
    public let rollout: Double?
    public let variant: String?
    public let segment: String?
}

/// A variant in an A/B test with a relative weight.
public struct Variant: Codable {
    public let name: String
    public let weight: Int
}

/// Schedule for automatic flag enable/disable.
public struct FlagSchedule: Codable {
    public let enableAt: String?
    public let disableAt: String?
}

/// Lifecycle metadata for a flag.
public struct FlagLifecycle: Codable {
    public let state: String
    public let sunsetAt: String?
}

/// Definition of a single feature flag.
public struct FlagDefinition: Codable {
    public let enabled: Bool
    public let description: String?
    public let tags: [String]?
    public let rollout: Double?
    public let rules: [Rule]?
    public let variants: [Variant]?
    public let schedule: FlagSchedule?
    public let requires: [String]?
    public let lifecycle: FlagLifecycle?
}

/// Root flag configuration.
public struct FlagConfig: Codable {
    public let version: Int?
    public let flags: [String: FlagDefinition]
}

/// Type-erased Codable wrapper for JSON values.
public struct AnyCodable: Codable {
    public let value: Any

    public init(_ value: Any) { self.value = value }

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            value = NSNull()
        } else if let bool = try? container.decode(Bool.self) {
            value = bool
        } else if let int = try? container.decode(Int.self) {
            value = int
        } else if let double = try? container.decode(Double.self) {
            value = double
        } else if let string = try? container.decode(String.self) {
            value = string
        } else if let array = try? container.decode([AnyCodable].self) {
            value = array.map { $0.value }
        } else if let dict = try? container.decode([String: AnyCodable].self) {
            value = dict.mapValues { $0.value }
        } else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unsupported type")
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch value {
        case let v as Bool: try container.encode(v)
        case let v as Int: try container.encode(v)
        case let v as Double: try container.encode(v)
        case let v as String: try container.encode(v)
        case is NSNull: try container.encodeNil()
        default: try container.encodeNil()
        }
    }
}
