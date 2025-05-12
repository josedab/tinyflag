import Foundation
#if canImport(UIKit)
import UIKit
#endif

/// TinyFlag iOS/macOS SDK — serverless, file-driven feature flags.
///
/// Evaluates flags locally with offline support, background sync,
/// and app lifecycle integration.
public final class TinyFlag: @unchecked Sendable {

    private var config: FlagConfig
    private let lock = NSLock()
    private var syncTimer: Timer?

    /// Initialize with inline flag configuration.
    public init(config: FlagConfig) {
        self.config = config
    }

    /// Initialize from a JSON data blob (for offline cache).
    public convenience init(jsonData: Data) throws {
        let config = try JSONDecoder().decode(FlagConfig.self, from: jsonData)
        self.init(config: config)
    }

    /// Update the flag configuration atomically.
    public func updateConfig(_ newConfig: FlagConfig) {
        lock.lock()
        defer { lock.unlock() }
        config = newConfig
    }

    /// Check if a flag is enabled for the given user context.
    public func isEnabled(_ flagName: String, context: [String: Any] = [:]) -> Bool {
        lock.lock()
        let cfg = config
        lock.unlock()

        guard let flag = cfg.flags[flagName] else { return false }

        // Lifecycle check
        if let lifecycle = flag.lifecycle, lifecycle.state == "archived" { return false }

        // Schedule check
        if !applySchedule(flag) { return false }

        if !flag.enabled { return false }

        // Prerequisite check
        if let requires = flag.requires {
            for req in requires {
                if !isEnabled(req, context: context) { return false }
            }
        }

        // Rule evaluation (top-to-bottom)
        if let rules = flag.rules {
            for rule in rules {
                if matchRule(rule, context: context) {
                    if let ruleEnabled = rule.enabled { return ruleEnabled }
                    if let ruleRollout = rule.rollout {
                        return checkRollout(flagName: flagName, percentage: ruleRollout, context: context)
                    }
                    return true
                }
            }
        }

        // Rollout check
        if let rollout = flag.rollout {
            return checkRollout(flagName: flagName, percentage: rollout, context: context)
        }

        return true
    }

    /// Get the assigned variant for a flag (A/B test).
    public func getVariant(_ flagName: String, context: [String: Any] = [:]) -> String? {
        lock.lock()
        let cfg = config
        lock.unlock()

        guard let flag = cfg.flags[flagName],
              let variants = flag.variants, !variants.isEmpty else { return nil }

        guard isEnabled(flagName, context: context) else { return nil }

        // Rule-based variant override
        if let rules = flag.rules {
            for rule in rules {
                if matchRule(rule, context: context), let ruleVariant = rule.variant {
                    return ruleVariant
                }
            }
        }

        // Hash-based variant selection
        guard let userId = context["userId"] as? String else {
            return variants.first?.name
        }

        let weighted = variants.map { ($0.name, $0.weight) }
        return MurmurHash3.selectVariant(flagName: flagName, userId: userId, variants: weighted)
    }

    // MARK: - Background Sync

    /// Start background syncing from a URL.
    public func startSync(url: URL, interval: TimeInterval = 60) {
        stopSync()
        let timer = Timer(timeInterval: interval, repeats: true) { [weak self] _ in
            self?.fetchConfig(from: url)
        }
        RunLoop.main.add(timer, forMode: .common)
        syncTimer = timer
        fetchConfig(from: url)
    }

    /// Stop background syncing.
    public func stopSync() {
        syncTimer?.invalidate()
        syncTimer = nil
    }

    // MARK: - App Lifecycle

    #if canImport(UIKit)
    /// Register for app lifecycle events to pause/resume sync.
    public func registerLifecycleObservers() {
        NotificationCenter.default.addObserver(
            forName: UIApplication.didEnterBackgroundNotification,
            object: nil, queue: .main
        ) { [weak self] _ in
            self?.syncTimer?.fireDate = .distantFuture
        }

        NotificationCenter.default.addObserver(
            forName: UIApplication.willEnterForegroundNotification,
            object: nil, queue: .main
        ) { [weak self] _ in
            guard let timer = self?.syncTimer else { return }
            timer.fireDate = Date()
        }
    }
    #endif

    /// Serialize current config to JSON data (for offline caching).
    public func serializeConfig() throws -> Data {
        lock.lock()
        let cfg = config
        lock.unlock()
        return try JSONEncoder().encode(cfg)
    }

    // MARK: - Private

    private func matchRule(_ rule: Rule, context: [String: Any]) -> Bool {
        for (key, expected) in rule.conditions {
            let contextValue = context[key]
            if !Operators.matchCondition(contextValue, expected.value) {
                return false
            }
        }
        return true
    }

    private func checkRollout(flagName: String, percentage: Double, context: [String: Any]) -> Bool {
        if percentage >= 100 { return true }
        if percentage <= 0 { return false }
        guard let userId = context["userId"] as? String else { return false }
        let bucket = MurmurHash3.rolloutBucket(flagName: flagName, userId: userId)
        return bucket < Int(percentage)
    }

    private func applySchedule(_ flag: FlagDefinition) -> Bool {
        guard let schedule = flag.schedule else { return true }
        let now = Date()
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        if let enableAt = schedule.enableAt,
           let enableDate = formatter.date(from: enableAt),
           now < enableDate {
            return false
        }
        if let disableAt = schedule.disableAt,
           let disableDate = formatter.date(from: disableAt),
           now >= disableDate {
            return false
        }
        return true
    }

    private func fetchConfig(from url: URL) {
        let task = URLSession.shared.dataTask(with: url) { [weak self] data, _, error in
            guard let data = data, error == nil else { return }
            if let newConfig = try? JSONDecoder().decode(FlagConfig.self, from: data) {
                self?.updateConfig(newConfig)
            }
        }
        task.resume()
    }
}
