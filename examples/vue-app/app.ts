/**
 * TinyFlag — Vue 3 + Nuxt Example
 *
 * This example shows how to use TinyFlag with Vue 3 composition API
 * and Nuxt for server-side rendering.
 *
 * Setup:
 *   npx nuxi@latest init my-app
 *   cd my-app
 *   npm install tinyflag tinyflag-vue
 */

// === flags.yml (project root) ===
// version: 1
// flags:
//   new-dashboard:
//     enabled: true
//     rollout: 75
//   premium-features:
//     enabled: true
//     rules:
//       - conditions:
//           plan: pro
//         enabled: true
//     rollout: 0

// === plugins/tinyflag.ts (Nuxt plugin) ===
// import { TinyFlag, parseYaml, parseFlagConfig } from 'tinyflag';
// import { provideTinyFlag } from 'tinyflag-vue';
// import { readFileSync } from 'fs';
//
// export default defineNuxtPlugin(async () => {
//   // Load flags on the server
//   if (process.server) {
//     const yaml = readFileSync('./flags.yml', 'utf-8');
//     const { config } = parseFlagConfig(parseYaml(yaml));
//     const ff = new TinyFlag({ source: config });
//     await ff.init();
//     provideTinyFlag({ instance: ff, context: { userId: 'server-user' } });
//   }
// });

// === Example Component ===
// <script setup lang="ts">
// import { useFlag, useVariant } from 'tinyflag-vue';
//
// const showNewDashboard = useFlag('new-dashboard');
// const hasPremium = useFlag('premium-features');
// </script>
//
// <template>
//   <div>
//     <h1 v-if="showNewDashboard">✨ New Dashboard</h1>
//     <h1 v-else>Dashboard</h1>
//
//     <section v-if="hasPremium" class="premium">
//       <h2>Premium Features</h2>
//       <p>Advanced analytics, custom reports, and more.</p>
//     </section>
//   </div>
// </template>

// === Standalone Vue 3 (no Nuxt) ===
import { createApp, defineComponent, h } from 'vue';

// Simulated usage (for demonstration)
const App = defineComponent({
  name: 'App',
  setup() {
    // In a real app, call provideTinyFlag() here
    return () => h('div', 'TinyFlag Vue Example - see comments for usage');
  },
});

console.log('🚩 TinyFlag — Vue Example');
console.log('See source comments for full usage with Nuxt SSR');
