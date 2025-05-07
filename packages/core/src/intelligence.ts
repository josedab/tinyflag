/**
 * AI-Powered Flag Intelligence for TinyFlag.
 *
 * Provides heuristic-based recommendations for optimal rollout percentages,
 * anomaly detection when flag changes correlate with error spikes,
 * and automated cleanup suggestions with confidence scores.
 */

import type { FlagConfig, FlagDefinition } from './types.js';

// --- Evaluation Event Aggregation ---

/** Aggregated evaluation event for intelligence analysis. */
export interface EvalEvent {
  flag: string;
  enabled: boolean;
  variant?: string;
  userId: string;
  timestamp: number;
  errorOccurred?: boolean;
  latencyMs?: number;
  converted?: boolean;
}

/** Time-series data point for a flag. */
export interface FlagTimeSeries {
  flag: string;
  interval: number;
  dataPoints: Array<{
    timestamp: number;
    evaluations: number;
    enabledCount: number;
    errorCount: number;
    avgLatency: number;
    conversions: number;
  }>;
}

// --- Rollout Recommendations ---

/** Recommendation for a flag's rollout percentage. */
export interface RolloutRecommendation {
  flag: string;
  currentRollout: number | undefined;
  recommendedRollout: number;
  confidence: number;
  reason: string;
  riskLevel: 'low' | 'medium' | 'high';
}

/**
 * Suggest optimal rollout percentages based on evaluation history.
 * Uses heuristic analysis: error rate, evaluation volume, and rollout age.
 */
export function suggestRolloutPercentage(
  flag: string,
  flagDef: FlagDefinition,
  events: EvalEvent[],
): RolloutRecommendation {
  const flagEvents = events.filter((e) => e.flag === flag);
  const totalEvals = flagEvents.length;
  const errorEvents = flagEvents.filter((e) => e.errorOccurred);
  const errorRate = totalEvals > 0 ? errorEvents.length / totalEvals : 0;
  const currentRollout = typeof flagDef.rollout === 'number' ? flagDef.rollout : undefined;

  // Not enough data
  if (totalEvals < 50) {
    return {
      flag,
      currentRollout,
      recommendedRollout: currentRollout ?? 5,
      confidence: 0.2,
      reason: 'Insufficient data — recommend starting with conservative 5% rollout',
      riskLevel: 'medium',
    };
  }

  // High error rate — reduce rollout
  if (errorRate > 0.1) {
    const recommended = Math.max(0, (currentRollout ?? 50) * 0.25);
    return {
      flag,
      currentRollout,
      recommendedRollout: Math.round(recommended),
      confidence: 0.85,
      reason: `High error rate (${(errorRate * 100).toFixed(1)}%) — recommend reducing rollout`,
      riskLevel: 'high',
    };
  }

  // Moderate error rate — hold steady
  if (errorRate > 0.03) {
    return {
      flag,
      currentRollout,
      recommendedRollout: currentRollout ?? 25,
      confidence: 0.6,
      reason: `Moderate error rate (${(errorRate * 100).toFixed(1)}%) — hold current rollout`,
      riskLevel: 'medium',
    };
  }

  // Low error rate — safe to increase
  if (currentRollout !== undefined && currentRollout < 100) {
    const step = currentRollout < 10 ? 10 : currentRollout < 50 ? 25 : 50;
    const recommended = Math.min(100, currentRollout + step);
    return {
      flag,
      currentRollout,
      recommendedRollout: recommended,
      confidence: 0.75,
      reason: `Low error rate (${(errorRate * 100).toFixed(1)}%) with ${totalEvals} evaluations — safe to increase`,
      riskLevel: 'low',
    };
  }

  return {
    flag,
    currentRollout,
    recommendedRollout: 100,
    confidence: 0.9,
    reason: `Flag performing well with ${totalEvals} evaluations and ${(errorRate * 100).toFixed(1)}% error rate`,
    riskLevel: 'low',
  };
}

// --- Anomaly Detection ---

/** Detected anomaly correlating a flag change with a metric spike. */
export interface FlagAnomaly {
  flag: string;
  type: 'error-spike' | 'latency-spike' | 'drop-off';
  severity: 'warning' | 'critical';
  detectedAt: number;
  description: string;
  beforeMetric: number;
  afterMetric: number;
  changePercent: number;
  confidence: number;
}

/**
 * Detect anomalies in flag evaluation history.
 * Looks for error rate spikes and latency increases correlated with flag state changes.
 */
export function detectAnomalies(
  flag: string,
  events: EvalEvent[],
  windowMs: number = 3600000,
): FlagAnomaly[] {
  const flagEvents = events.filter((e) => e.flag === flag).sort((a, b) => a.timestamp - b.timestamp);
  if (flagEvents.length < 20) return [];

  const anomalies: FlagAnomaly[] = [];
  const now = Date.now();

  // Split into before/after windows
  const midpoint = now - windowMs;
  const before = flagEvents.filter((e) => e.timestamp < midpoint);
  const after = flagEvents.filter((e) => e.timestamp >= midpoint);

  if (before.length < 10 || after.length < 10) return [];

  // Error rate anomaly
  const beforeErrorRate = before.filter((e) => e.errorOccurred).length / before.length;
  const afterErrorRate = after.filter((e) => e.errorOccurred).length / after.length;

  if (afterErrorRate > beforeErrorRate * 2 && afterErrorRate > 0.05) {
    const changePercent = beforeErrorRate > 0
      ? ((afterErrorRate - beforeErrorRate) / beforeErrorRate) * 100
      : afterErrorRate * 100;

    anomalies.push({
      flag,
      type: 'error-spike',
      severity: afterErrorRate > 0.15 ? 'critical' : 'warning',
      detectedAt: now,
      description: `Error rate increased from ${(beforeErrorRate * 100).toFixed(1)}% to ${(afterErrorRate * 100).toFixed(1)}%`,
      beforeMetric: beforeErrorRate,
      afterMetric: afterErrorRate,
      changePercent,
      confidence: Math.min(0.95, 0.5 + (after.length / 100) * 0.1),
    });
  }

  // Latency anomaly
  const beforeLatencies = before.filter((e) => e.latencyMs !== undefined).map((e) => e.latencyMs!);
  const afterLatencies = after.filter((e) => e.latencyMs !== undefined).map((e) => e.latencyMs!);

  if (beforeLatencies.length >= 10 && afterLatencies.length >= 10) {
    const beforeAvg = beforeLatencies.reduce((a, b) => a + b, 0) / beforeLatencies.length;
    const afterAvg = afterLatencies.reduce((a, b) => a + b, 0) / afterLatencies.length;

    if (afterAvg > beforeAvg * 1.5 && afterAvg > 100) {
      anomalies.push({
        flag,
        type: 'latency-spike',
        severity: afterAvg > beforeAvg * 3 ? 'critical' : 'warning',
        detectedAt: now,
        description: `Average latency increased from ${beforeAvg.toFixed(0)}ms to ${afterAvg.toFixed(0)}ms`,
        beforeMetric: beforeAvg,
        afterMetric: afterAvg,
        changePercent: ((afterAvg - beforeAvg) / beforeAvg) * 100,
        confidence: Math.min(0.9, 0.4 + (afterLatencies.length / 100) * 0.1),
      });
    }
  }

  return anomalies;
}

// --- Cleanup Suggestions ---

/** Suggestion to clean up a flag. */
export interface CleanupSuggestion {
  flag: string;
  reason: 'stale' | 'always-on' | 'always-off' | 'archived' | 'sunset-expired' | 'no-evaluations';
  confidence: number;
  description: string;
  suggestedAction: 'remove' | 'archive' | 'review';
  lastEvaluated?: number;
}

/**
 * Suggest flags that can be cleaned up based on evaluation patterns.
 */
export function suggestCleanup(
  config: FlagConfig,
  events: EvalEvent[],
  staleThresholdMs: number = 30 * 24 * 3600 * 1000,
): CleanupSuggestion[] {
  const suggestions: CleanupSuggestion[] = [];
  const now = Date.now();

  for (const [flagName, flagDef] of Object.entries(config.flags)) {
    const flagEvents = events.filter((e) => e.flag === flagName);

    // Archived flags
    if (flagDef.lifecycle?.state === 'archived') {
      suggestions.push({
        flag: flagName,
        reason: 'archived',
        confidence: 0.95,
        description: 'Flag is archived — safe to remove from config',
        suggestedAction: 'remove',
      });
      continue;
    }

    // Sunset expired
    if (flagDef.lifecycle?.state === 'sunset' && flagDef.lifecycle.sunsetAt) {
      const sunsetTime = new Date(flagDef.lifecycle.sunsetAt).getTime();
      if (!isNaN(sunsetTime) && now > sunsetTime) {
        suggestions.push({
          flag: flagName,
          reason: 'sunset-expired',
          confidence: 0.9,
          description: `Sunset date passed (${flagDef.lifecycle.sunsetAt}) — ready for removal`,
          suggestedAction: 'remove',
        });
        continue;
      }
    }

    // No evaluations
    if (flagEvents.length === 0) {
      suggestions.push({
        flag: flagName,
        reason: 'no-evaluations',
        confidence: 0.5,
        description: 'No evaluation events recorded — may be unused',
        suggestedAction: 'review',
      });
      continue;
    }

    const lastEval = Math.max(...flagEvents.map((e) => e.timestamp));

    // Stale — not evaluated recently
    if (now - lastEval > staleThresholdMs) {
      const daysSinceEval = Math.floor((now - lastEval) / (24 * 3600 * 1000));
      suggestions.push({
        flag: flagName,
        reason: 'stale',
        confidence: Math.min(0.9, 0.5 + daysSinceEval / 180),
        description: `Not evaluated in ${daysSinceEval} days — likely unused`,
        suggestedAction: 'archive',
        lastEvaluated: lastEval,
      });
      continue;
    }

    // Always on — 100% enabled, consider hardcoding
    if (flagDef.enabled && !flagDef.rollout && !flagDef.rules?.length) {
      const enabledRate = flagEvents.filter((e) => e.enabled).length / flagEvents.length;
      if (enabledRate > 0.99 && flagEvents.length > 100) {
        suggestions.push({
          flag: flagName,
          reason: 'always-on',
          confidence: 0.8,
          description: `Always enabled (${(enabledRate * 100).toFixed(1)}%) — consider hardcoding`,
          suggestedAction: 'review',
          lastEvaluated: lastEval,
        });
      }
    }

    // Always off
    if (!flagDef.enabled) {
      const disabledRate = flagEvents.filter((e) => !e.enabled).length / flagEvents.length;
      if (disabledRate > 0.99 && flagEvents.length > 50) {
        suggestions.push({
          flag: flagName,
          reason: 'always-off',
          confidence: 0.75,
          description: 'Always disabled — consider removing',
          suggestedAction: 'archive',
          lastEvaluated: lastEval,
        });
      }
    }
  }

  return suggestions.sort((a, b) => b.confidence - a.confidence);
}

// --- Formatting ---

/** Format rollout recommendations as human-readable output. */
export function formatRecommendations(recommendations: RolloutRecommendation[]): string {
  const lines: string[] = ['📊 Rollout Recommendations', '═'.repeat(50), ''];

  for (const rec of recommendations) {
    const riskIcon = rec.riskLevel === 'high' ? '🔴' : rec.riskLevel === 'medium' ? '🟡' : '🟢';
    const current = rec.currentRollout !== undefined ? `${rec.currentRollout}%` : 'N/A';
    lines.push(`${riskIcon} ${rec.flag}`);
    lines.push(`   Current: ${current} → Recommended: ${rec.recommendedRollout}%`);
    lines.push(`   Confidence: ${(rec.confidence * 100).toFixed(0)}% | ${rec.reason}`);
    lines.push('');
  }

  return lines.join('\n');
}

/** Format anomalies as human-readable output. */
export function formatAnomalies(anomalies: FlagAnomaly[]): string {
  if (anomalies.length === 0) return '✅ No anomalies detected';

  const lines: string[] = ['⚠️  Anomalies Detected', '═'.repeat(50), ''];

  for (const a of anomalies) {
    const icon = a.severity === 'critical' ? '🚨' : '⚠️';
    lines.push(`${icon} ${a.flag} — ${a.type}`);
    lines.push(`   ${a.description}`);
    lines.push(`   Change: ${a.changePercent.toFixed(1)}% | Confidence: ${(a.confidence * 100).toFixed(0)}%`);
    lines.push('');
  }

  return lines.join('\n');
}

/** Format cleanup suggestions as human-readable output. */
export function formatCleanupSuggestions(suggestions: CleanupSuggestion[]): string {
  if (suggestions.length === 0) return '✅ No cleanup suggestions';

  const lines: string[] = ['🧹 Cleanup Suggestions', '═'.repeat(50), ''];

  for (const s of suggestions) {
    const actionIcon = s.suggestedAction === 'remove' ? '🗑️' : s.suggestedAction === 'archive' ? '📦' : '👁️';
    lines.push(`${actionIcon} ${s.flag} — ${s.reason}`);
    lines.push(`   ${s.description}`);
    lines.push(`   Action: ${s.suggestedAction} | Confidence: ${(s.confidence * 100).toFixed(0)}%`);
    lines.push('');
  }

  return lines.join('\n');
}
