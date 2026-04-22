/**
 * TinyFlag — Next.js Example (React SSR)
 *
 * This example shows how to use TinyFlag with Next.js App Router
 * for server-side rendered feature flags.
 *
 * Setup:
 *   npx create-next-app@latest my-app
 *   cd my-app
 *   npm install tinyflag tinyflag-react
 */

// === flags.yml (project root) ===
// version: 1
// flags:
//   new-checkout:
//     enabled: true
//     rollout: 50
//     variants:
//       - name: control
//         weight: 50
//       - name: redesign
//         weight: 50
//   dark-mode:
//     enabled: false

// === app/providers.tsx ===
// Client component that provides TinyFlag to the app
'use client';

import React from 'react';
import { TinyFlagProvider, useFlag, useVariant } from 'tinyflag-react';
import { TinyFlag } from 'tinyflag';
import type { FlagConfig } from 'tinyflag';

// For SSR: accept pre-loaded flags as props
export function Providers({
  children,
  flagConfig,
  userId,
}: {
  children: React.ReactNode;
  flagConfig: FlagConfig;
  userId: string;
}) {
  return (
    <TinyFlagProvider source={flagConfig} context={{ userId }}>
      {children}
    </TinyFlagProvider>
  );
}

// === app/layout.tsx ===
// Server component that loads flags and wraps the app
// import { readFileSync } from 'fs';
// import { parseYaml, parseFlagConfig } from 'tinyflag';
// import { Providers } from './providers';
//
// export default function RootLayout({ children }) {
//   const yaml = readFileSync('./flags.yml', 'utf-8');
//   const raw = parseYaml(yaml);
//   const { config } = parseFlagConfig(raw);
//
//   return (
//     <html>
//       <body>
//         <Providers flagConfig={config} userId={getUserId()}>
//           {children}
//         </Providers>
//       </body>
//     </html>
//   );
// }

// === components/CheckoutButton.tsx ===
export function CheckoutButton() {
  const showNewCheckout = useFlag('new-checkout');
  const variant = useVariant('new-checkout');

  if (!showNewCheckout) {
    return <button>Classic Checkout</button>;
  }

  return (
    <button>
      {variant === 'redesign' ? '🚀 New Checkout' : 'Checkout'}
    </button>
  );
}

// === components/ThemeToggle.tsx ===
export function ThemeToggle() {
  const darkModeEnabled = useFlag('dark-mode');

  if (!darkModeEnabled) return null;

  return <button>🌙 Toggle Dark Mode</button>;
}
