import Foundation

/// Condition matching operators for targeting rules.
public enum Operators {

    /// Match a context value against a condition (supports $in, $not, $gt, $gte, $lt, $lte, glob).
    public static func matchCondition(_ contextValue: Any?, _ expected: Any?) -> Bool {
        guard let expected = expected else { return contextValue == nil }

        if let dict = expected as? [String: Any] {
            // Operator matching
            if let inArray = dict["$in"] as? [Any] {
                guard let cv = contextValue else { return false }
                return inArray.contains { anyEquals($0, cv) }
            }
            if let notValue = dict["$not"] {
                return !matchCondition(contextValue, notValue)
            }
            if let gtValue = dict["$gt"] {
                guard let cv = toDouble(contextValue), let ev = toDouble(gtValue) else { return false }
                return cv > ev
            }
            if let gteValue = dict["$gte"] {
                guard let cv = toDouble(contextValue), let ev = toDouble(gteValue) else { return false }
                return cv >= ev
            }
            if let ltValue = dict["$lt"] {
                guard let cv = toDouble(contextValue), let ev = toDouble(ltValue) else { return false }
                return cv < ev
            }
            if let lteValue = dict["$lte"] {
                guard let cv = toDouble(contextValue), let ev = toDouble(lteValue) else { return false }
                return cv <= ev
            }
            return false
        }

        // Glob pattern matching
        if let pattern = expected as? String, pattern.contains("*") {
            guard let cv = contextValue as? String else { return false }
            return globMatch(pattern: pattern, value: cv)
        }

        // Exact match
        return anyEquals(contextValue, expected)
    }

    private static func anyEquals(_ a: Any?, _ b: Any?) -> Bool {
        if a == nil && b == nil { return true }
        guard let a = a, let b = b else { return false }
        if let sa = a as? String, let sb = b as? String { return sa == sb }
        if let da = toDouble(a), let db = toDouble(b) { return da == db }
        if let ba = a as? Bool, let bb = b as? Bool { return ba == bb }
        return String(describing: a) == String(describing: b)
    }

    private static func toDouble(_ value: Any?) -> Double? {
        guard let value = value else { return nil }
        if let d = value as? Double { return d }
        if let i = value as? Int { return Double(i) }
        if let s = value as? String { return Double(s) }
        return nil
    }

    private static func globMatch(pattern: String, value: String) -> Bool {
        let escaped = NSRegularExpression.escapedPattern(for: pattern)
        let regex = escaped.replacingOccurrences(of: "\\*", with: ".*")
        guard let re = try? NSRegularExpression(pattern: "^\(regex)$") else { return false }
        let range = NSRange(value.startIndex..., in: value)
        return re.firstMatch(in: value, range: range) != nil
    }
}
