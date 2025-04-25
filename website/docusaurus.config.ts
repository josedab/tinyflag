import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'TinyFlag',
  tagline: 'Feature flags that fit in your pocket',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  url: 'https://josedab.github.io',
  baseUrl: '/tinyflag/',

  organizationName: 'josedab',
  projectName: 'tinyflag',

  onBrokenLinks: 'throw',

  markdown: {
    mermaid: true,
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  themes: [
    '@docusaurus/theme-mermaid',
    [
      '@easyops-cn/docusaurus-search-local',
      {
        hashed: true,
        docsRouteBasePath: '/docs',
        indexBlog: false,
      },
    ],
  ],

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/josedab/tinyflag/tree/main/website/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/tinyflag-social-card.png',
    colorMode: {
      defaultMode: 'light',
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'TinyFlag',
      logo: {
        alt: 'TinyFlag Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          to: '/docs/getting-started',
          label: 'Get Started',
          position: 'left',
        },
        {
          href: 'https://www.npmjs.com/package/tinyflag',
          label: 'npm',
          position: 'right',
        },
        {
          href: 'https://github.com/josedab/tinyflag',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            { label: 'Getting Started', to: '/docs/getting-started' },
            { label: 'API Reference', to: '/docs/reference/api' },
            { label: 'CLI Reference', to: '/docs/reference/cli' },
            { label: 'Architecture', to: '/docs/architecture' },
          ],
        },
        {
          title: 'Integrations',
          items: [
            { label: 'React', to: '/docs/integrations/react' },
            { label: 'Vue', to: '/docs/integrations/vue' },
            { label: 'Svelte', to: '/docs/integrations/svelte' },
            { label: 'Migration Guide', to: '/docs/migration' },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/josedab/tinyflag',
            },
            {
              label: 'npm',
              href: 'https://www.npmjs.com/package/tinyflag',
            },
            {
              label: 'Changelog',
              href: 'https://github.com/josedab/tinyflag/blob/main/CHANGELOG.md',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} TinyFlag. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'yaml', 'json'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
