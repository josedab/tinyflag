import type { ReactNode } from 'react';
import { useState } from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import CodeBlock from '@theme/CodeBlock';

import styles from './index.module.css';

const features = [
  {
    icon: '📦',
    title: 'Zero Dependencies',
    description:
      'No runtime dependencies. Under 8KB gzipped. Ships a custom YAML parser and MurmurHash3 implementation built from scratch.',
  },
  {
    icon: '🗄️',
    title: 'Git-Native Flags',
    description:
      'Define flags in YAML or JSON, commit to Git. Changes go through PRs with full history, review, and rollback.',
  },
  {
    icon: '⚡',
    title: 'No Server Required',
    description:
      'Evaluate flags entirely in-process. No API keys, no network calls, no vendor lock-in. Works offline.',
  },
  {
    icon: '🎯',
    title: 'Targeting & Rollouts',
    description:
      'Target user segments with rules. Roll out features to a percentage of users with deterministic hashing.',
  },
  {
    icon: '🧪',
    title: 'A/B Testing Built-in',
    description:
      'Run experiments with weighted variants. Deterministic assignment ensures users always see the same variant.',
  },
  {
    icon: '🌐',
    title: 'Runs Everywhere',
    description:
      'Node.js, Bun, Deno, browsers, Cloudflare Workers, Vercel Edge — TinyFlag works in any JavaScript runtime.',
  },
];

const frameworks = [
  { name: 'React', emoji: '⚛️', to: '/docs/integrations/react' },
  { name: 'Vue', emoji: '💚', to: '/docs/integrations/vue' },
  { name: 'Svelte', emoji: '🧡', to: '/docs/integrations/svelte' },
  { name: 'Next.js', emoji: '▲', to: '/docs/integrations/react#nextjs-ssr' },
  { name: 'Nuxt', emoji: '💎', to: '/docs/integrations/vue#nuxt-ssr' },
  { name: 'SvelteKit', emoji: '🔥', to: '/docs/integrations/svelte#sveltekit-ssr' },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button
      className="install-command"
      onClick={handleCopy}
      title="Click to copy"
      aria-label={`Copy "${text}" to clipboard`}
      type="button"
    >
      <span className="install-command__prefix">$ </span>
      <span>{text}</span>
      <span className="install-command__icon">{copied ? ' ✓' : ' 📋'}</span>
    </button>
  );
}

function HeroSection() {
  return (
    <header className="hero--tinyflag">
      <div className="container">
        <div className="hero__logo">🚩</div>
        <Heading as="h1" className="hero__title">
          TinyFlag
        </Heading>
        <p className="hero__subtitle">
          Serverless, file-driven, zero-dependency feature flags for JavaScript and TypeScript.
        </p>
        <div className="hero__badges">
          <a href="https://www.npmjs.com/package/tinyflag">
            <img src="https://img.shields.io/npm/v/tinyflag" alt="npm version" />
          </a>
          <a href="https://github.com/josedab/tinyflag/actions/workflows/ci.yml">
            <img
              src="https://github.com/josedab/tinyflag/actions/workflows/ci.yml/badge.svg"
              alt="CI"
            />
          </a>
          <a href="https://codecov.io/gh/josedab/tinyflag">
            <img
              src="https://codecov.io/gh/josedab/tinyflag/branch/main/graph/badge.svg"
              alt="codecov"
            />
          </a>
          <a href="https://bundlephobia.com/package/tinyflag">
            <img src="https://img.shields.io/bundlephobia/minzip/tinyflag" alt="bundle size" />
          </a>
          <a href="https://github.com/josedab/tinyflag/blob/main/LICENSE">
            <img src="https://img.shields.io/npm/l/tinyflag" alt="license" />
          </a>
        </div>
        <CopyButton text="npm install tinyflag" />
        <div className="hero__cta">
          <Link className="button button--primary button--lg" to="/docs/getting-started">
            Get Started →
          </Link>
          <Link
            className="button button--outline button--lg"
            style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.4)' }}
            href="https://github.com/josedab/tinyflag"
          >
            GitHub ⭐
          </Link>
        </div>
      </div>
    </header>
  );
}

function FeaturesSection() {
  return (
    <section className="features-section">
      <div className="container">
        <Heading as="h2" style={{ textAlign: 'center', marginBottom: '2rem' }}>
          Why TinyFlag?
        </Heading>
        <div className="features-grid">
          {features.map((feature) => (
            <div className="feature-card" key={feature.title}>
              <div className="feature-card__icon">{feature.icon}</div>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ComparisonSection() {
  return (
    <section className="comparison-section">
      <div className="container">
        <Heading as="h2">How TinyFlag Compares</Heading>
        <div className="comparison-table">
          <table>
            <thead>
              <tr>
                <th>Feature</th>
                <th>LaunchDarkly</th>
                <th>Unleash</th>
                <th>GrowthBook</th>
                <th>
                  <strong>TinyFlag</strong>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Requires server</td>
                <td>✅ (SaaS)</td>
                <td>✅</td>
                <td>✅</td>
                <td>
                  <strong>❌ No</strong>
                </td>
              </tr>
              <tr>
                <td>Git-native flags</td>
                <td>❌</td>
                <td>❌</td>
                <td>❌</td>
                <td>
                  <strong>✅</strong>
                </td>
              </tr>
              <tr>
                <td>Zero dependencies</td>
                <td>❌</td>
                <td>❌</td>
                <td>❌</td>
                <td>
                  <strong>✅</strong>
                </td>
              </tr>
              <tr>
                <td>Edge/serverless</td>
                <td>Partial</td>
                <td>❌</td>
                <td>Partial</td>
                <td>
                  <strong>✅</strong>
                </td>
              </tr>
              <tr>
                <td>Bundle size</td>
                <td>~50KB</td>
                <td>~30KB</td>
                <td>~20KB</td>
                <td>
                  <strong>&lt; 8KB</strong>
                </td>
              </tr>
              <tr>
                <td>Pricing</td>
                <td>$$$$</td>
                <td>Free + paid</td>
                <td>Free + paid</td>
                <td>
                  <strong>Free forever</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function CodeExampleSection() {
  const flagsYaml = `version: 1
flags:
  new-checkout:
    enabled: true
    rollout: 50
  dark-mode:
    enabled: false`;

  const usageCode = `import { TinyFlag } from 'tinyflag';

const ff = new TinyFlag({ source: './flags.yml' });
await ff.init();

if (ff.isEnabled('new-checkout', { userId: user.id })) {
  showNewCheckout();
}`;

  return (
    <section className="code-section">
      <div className="container">
        <Heading as="h2">Up and Running in 60 Seconds</Heading>
        <div className="code-columns">
          <div>
            <h3>1. Define your flags</h3>
            <CodeBlock language="yaml" title="flags.yml">
              {flagsYaml}
            </CodeBlock>
          </div>
          <div>
            <h3>2. Use them</h3>
            <CodeBlock language="typescript" title="app.ts">
              {usageCode}
            </CodeBlock>
          </div>
        </div>
      </div>
    </section>
  );
}

function FrameworksSection() {
  return (
    <section className="frameworks-section">
      <div className="container">
        <Heading as="h2" style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
          Works With Your Stack
        </Heading>
        <p
          style={{
            textAlign: 'center',
            color: 'var(--ifm-color-emphasis-600)',
            marginBottom: '2rem',
          }}
        >
          First-class bindings with SSR support
        </p>
        <div className="frameworks-grid">
          {frameworks.map((fw) => (
            <Link key={fw.name} to={fw.to} className="framework-badge">
              <span className="framework-badge__emoji">{fw.emoji}</span>
              <span>{fw.name}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

const advancedCapabilities = [
  {
    icon: '🧪',
    title: 'A/B Experiments',
    description: 'Track conversions, compute confidence intervals, and declare winners with built-in Bayesian and frequentist analysis.',
    to: '/docs/tools/experiments',
  },
  {
    icon: '🚀',
    title: 'Progressive Rollouts',
    description: 'Multi-stage canary → ring → GA pipelines with health-check gates and automatic rollback.',
    to: '/docs/tools/progressive',
  },
  {
    icon: '🔔',
    title: 'Webhooks & Event Bus',
    description: 'Push flag changes to Kafka, AWS SNS, Google PubSub, or any HTTP endpoint with HMAC signing.',
    to: '/docs/tools/webhooks',
  },
  {
    icon: '🛡️',
    title: 'Governance & RBAC',
    description: 'Role-based access control, approval workflows, and tamper-proof audit trails with HMAC hash chains.',
    to: '/docs/tools/governance',
  },
  {
    icon: '🧠',
    title: 'Flag Intelligence',
    description: 'Anomaly detection, rollout recommendations, and automated cleanup suggestions from evaluation data.',
    to: '/docs/tools/intelligence',
  },
  {
    icon: '🎰',
    title: 'Bandit Optimizer',
    description: 'Thompson Sampling multi-armed bandit that auto-tunes variant weights to maximize conversions.',
    to: '/docs/tools/bandit',
  },
];

function AdvancedSection() {
  return (
    <section className="features-section">
      <div className="container">
        <Heading as="h2" style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
          Enterprise-Grade, Zero-Dependency
        </Heading>
        <p
          style={{
            textAlign: 'center',
            color: 'var(--ifm-color-emphasis-600)',
            marginBottom: '2rem',
            maxWidth: '640px',
            margin: '0 auto 2rem',
          }}
        >
          Advanced capabilities built into the core — no extra services, no extra dependencies.
        </p>
        <div className="features-grid">
          {advancedCapabilities.map((cap) => (
            <Link
              key={cap.title}
              to={cap.to}
              className="feature-card"
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <div className="feature-card__icon">{cap.icon}</div>
              <h3>{cap.title}</h3>
              <p>{cap.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function ArchitectureSection() {
  return (
    <section className="comparison-section">
      <div className="container">
        <Heading as="h2" style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
          How It All Fits Together
        </Heading>
        <p
          style={{
            textAlign: 'center',
            color: 'var(--ifm-color-emphasis-600)',
            marginBottom: '2rem',
            maxWidth: '640px',
            margin: '0 auto 2rem',
          }}
        >
          One core library, four module layers. Import only what you need — tree-shaking drops the rest.
        </p>
        <div style={{ maxWidth: '800px', margin: '0 auto', padding: '0 1rem' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '0.75rem',
              textAlign: 'center',
              fontSize: '0.9rem',
            }}
          >
            {[
              { label: '⚡ Runtime', items: ['CachedClient', 'Multi-tenant', 'Merge', 'Rollout Strategies'], color: '#3498db' },
              { label: '🚀 Delivery', items: ['Progressive Rollouts', 'Sync', 'Signing', 'Audit'], color: '#2ecc71' },
              { label: '📊 Optimization', items: ['Experiments', 'Intelligence', 'Correlation', 'Bandit'], color: '#e67e22' },
              { label: '🔍 Verification', items: ['Replay', 'Perf Testing', 'Governance', 'Webhooks'], color: '#9b59b6' },
            ].map((col) => (
              <div key={col.label}>
                <div
                  style={{
                    background: col.color,
                    color: '#fff',
                    padding: '0.5rem',
                    borderRadius: '8px 8px 0 0',
                    fontWeight: 600,
                  }}
                >
                  {col.label}
                </div>
                <div
                  style={{
                    border: `2px solid ${col.color}33`,
                    borderTop: 'none',
                    borderRadius: '0 0 8px 8px',
                    padding: '0.5rem',
                  }}
                >
                  {col.items.map((item) => (
                    <div key={item} style={{ padding: '0.25rem 0', fontSize: '0.85rem' }}>
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div
            style={{
              marginTop: '0.75rem',
              background: 'var(--ifm-color-primary)',
              color: '#fff',
              padding: '0.75rem',
              borderRadius: '8px',
              textAlign: 'center',
              fontWeight: 700,
              fontSize: '1rem',
            }}
          >
            🚩 TinyFlag Core — Loader · Evaluator · Events · MurmurHash3 · YAML Parser
          </div>
          <p style={{ textAlign: 'center', marginTop: '1rem', opacity: 0.6, fontSize: '0.85rem' }}>
            <Link to="/docs/architecture">View full architecture →</Link>
          </p>
        </div>
      </div>
    </section>
  );
}

export default function Home(): ReactNode {
  return (
    <Layout
      title="Feature flags that fit in your pocket"
      description="Serverless, file-driven, zero-dependency feature flag SDK for JavaScript and TypeScript. Define flags in YAML, commit to Git, evaluate everywhere."
    >
      <HeroSection />
      <main>
        <FeaturesSection />
        <ComparisonSection />
        <CodeExampleSection />
        <FrameworksSection />
        <AdvancedSection />
        <ArchitectureSection />
      </main>
    </Layout>
  );
}
