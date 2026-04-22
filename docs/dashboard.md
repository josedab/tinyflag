# Dashboard

TinyFlag includes a static micro-dashboard — a single HTML file that visualizes your flag configuration.

## Usage

1. Open `packages/dashboard/index.html` in a browser
2. Load flags via:
   - **URL**: Paste a URL to your flags file
   - **Upload**: Upload a local `.yml` or `.json` file
   - **Paste**: Paste YAML or JSON directly

## Features

- **Search & Filter**: Find flags by name, description, or enabled state
- **Visual Rollout**: Progress bars showing rollout percentages
- **Details View**: Expand to see rules and variants
- **Edit Mode**: Toggle flags and adjust rollout percentages
- **Download**: Export modified flags as YAML
- **Dark Mode**: Follows system preference
- **Responsive**: Works on mobile (min-width: 320px)

## Deployment

The dashboard is a single HTML file with zero dependencies. Deploy it anywhere:

```bash
# GitHub Pages
cp packages/dashboard/index.html docs/dashboard.html

# Vercel / Netlify
# Just serve the HTML file

# Auto-load flags from URL
# Add ?url=https://raw.githubusercontent.com/.../flags.yml to the URL
```

## Limitations

- Read-only by default — edit mode is for local preview only
- Downloads a new file; does not modify the original source
- No authentication — the dashboard is a static HTML file
