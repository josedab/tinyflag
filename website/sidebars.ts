import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    'getting-started',
    'examples',
    {
      type: 'category',
      label: 'Core Concepts',
      items: [
        'concepts/flag-format',
        'concepts/targeting-rules',
        'concepts/evaluation',
        'concepts/advanced-features',
      ],
    },
    {
      type: 'category',
      label: 'Integrations',
      items: ['integrations/react', 'integrations/vue', 'integrations/svelte'],
    },
    {
      type: 'category',
      label: 'Tools',
      items: ['tools/cli', 'tools/dashboard', 'tools/github-action'],
    },
    {
      type: 'category',
      label: 'Advanced',
      items: [
        'tools/audit',
        'tools/multi-tenant',
        'tools/signing',
        'tools/sync',
        'tools/replay',
        'tools/cached',
        'tools/experiments',
        'tools/progressive',
        'tools/webhooks',
        'tools/governance',
        'tools/intelligence',
        'tools/correlation',
        'tools/bandit',
        'tools/perf',
      ],
    },
    {
      type: 'category',
      label: 'Reference',
      items: ['reference/api', 'reference/cli'],
    },
    'architecture',
    'security',
    'migration',
    'troubleshooting',
    'why-tinyflag',
  ],
};

export default sidebars;
