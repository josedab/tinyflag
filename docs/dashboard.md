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
```

## Auto-Load from URL

Append the `?url=` query parameter to automatically load flags when the dashboard opens. This is useful for bookmarks and shared links.

```
https://your-dashboard.example.com/?url=https://raw.githubusercontent.com/your-org/your-repo/main/flags.yml
```

**Requirements:**
- The URL must point to a valid YAML or JSON flag file.
- URL-encode the value if it contains special characters (e.g., `&`, `=`).
- The remote server must allow CORS requests from the dashboard origin.

**Example with GitHub raw URLs:**

```
https://your-dashboard.example.com/?url=https%3A%2F%2Fraw.githubusercontent.com%2Fyour-org%2Fyour-repo%2Fmain%2Fflags.yml
```

## Limitations

- Read-only by default — edit mode is for local preview only
- Downloads a new file; does not modify the original source
- No authentication — the dashboard is a static HTML file
