/**
 * TinyFlag — SvelteKit Example
 *
 * This example shows how to use TinyFlag with SvelteKit
 * for server-side rendered feature flags.
 *
 * Setup:
 *   npx sv create my-app
 *   cd my-app
 *   npm install tinyflag tinyflag-svelte
 */

// === flags.yml (project root) ===
// version: 1
// flags:
//   redesign:
//     enabled: true
//     rollout: 30
//     variants:
//       - name: control
//         weight: 70
//       - name: new-ui
//         weight: 30
//   beta-panel:
//     enabled: true
//     rules:
//       - conditions:
//           role: admin
//         enabled: true
//     rollout: 0

// === src/hooks.server.ts (SvelteKit server hook) ===
// import { TinyFlag } from 'tinyflag';
// import { createTinyFlag } from 'tinyflag-svelte';
//
// const ff = new TinyFlag({ source: './flags.yml' });
// await ff.init();
//
// export async function handle({ event, resolve }) {
//   const userId = event.cookies.get('userId') || 'anonymous';
//   createTinyFlag({ instance: ff, context: { userId } });
//   return resolve(event);
// }

// === src/routes/+page.svelte ===
// <script>
//   import { flag, variant } from 'tinyflag-svelte';
//
//   const showRedesign = flag('redesign');
//   const uiVariant = variant('redesign');
//   const showBetaPanel = flag('beta-panel');
// </script>
//
// {#if $showRedesign}
//   <h1>Welcome to the {$uiVariant === 'new-ui' ? '✨ New' : ''} App</h1>
// {:else}
//   <h1>Welcome to the App</h1>
// {/if}
//
// {#if $showBetaPanel}
//   <aside class="beta-panel">
//     <h2>🧪 Beta Panel</h2>
//     <p>You have access to experimental features.</p>
//   </aside>
// {/if}

console.log('🚩 TinyFlag — SvelteKit Example');
console.log('See source comments for full usage with SvelteKit SSR');
