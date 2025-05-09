import { readFileSync, writeFileSync, existsSync } from 'fs';
import { parseYaml } from 'tinyflag';
import { WebhookEngine } from 'tinyflag';
import type { WebhookEndpoint } from 'tinyflag';

const WEBHOOKS_FILE = 'webhooks.yml';

interface WebhooksConfig {
  version: number;
  endpoints: WebhookEndpoint[];
}

function loadWebhooksConfig(file: string): WebhooksConfig {
  if (!existsSync(file)) {
    return { version: 1, endpoints: [] };
  }
  const content = readFileSync(file, 'utf8');
  const raw = parseYaml(content) as Record<string, unknown>;
  return {
    version: typeof raw.version === 'number' ? raw.version : 1,
    endpoints: Array.isArray(raw.endpoints)
      ? (raw.endpoints as WebhookEndpoint[]).map((ep) => ({
          id: String(ep.id || ''),
          url: String(ep.url || ''),
          secret: ep.secret ? String(ep.secret) : undefined,
          filter: ep.filter,
          headers: ep.headers,
          active: ep.active !== false,
        }))
      : [],
  };
}

function saveWebhooksConfig(file: string, config: WebhooksConfig): void {
  const lines: string[] = [`version: ${config.version}`, 'endpoints:'];
  for (const ep of config.endpoints) {
    lines.push(`  - id: "${ep.id}"`);
    lines.push(`    url: "${ep.url}"`);
    if (ep.secret) lines.push(`    secret: "${ep.secret}"`);
    lines.push(`    active: ${ep.active}`);
    if (ep.filter?.types?.length) {
      lines.push(`    filter:`);
      lines.push(`      types: [${ep.filter.types.map((t) => `"${t}"`).join(', ')}]`);
    }
  }
  writeFileSync(file, lines.join('\n') + '\n');
}

export function handleWebhooks(args: string[], jsonMode: boolean): void {
  const subcommand = args[0];

  if (!subcommand || subcommand === 'help') {
    console.log(`Usage: tinyflag webhooks <subcommand> [options]

Subcommands:
  add                  Add a webhook endpoint
  remove <id>          Remove a webhook endpoint
  list                 List webhook endpoints
  test <id>            Test a webhook endpoint

Options:
  --url <url>          Webhook URL (for add)
  --id <id>            Endpoint ID (for add, defaults to auto-generated)
  --secret <key>       HMAC signing secret
  --config <file>      Webhooks config file (default: webhooks.yml)`);
    return;
  }

  const configIdx = args.indexOf('--config');
  const configFile = configIdx >= 0 && args[configIdx + 1] ? args[configIdx + 1] : WEBHOOKS_FILE;

  switch (subcommand) {
    case 'add':
      handleWebhookAdd(args.slice(1), configFile, jsonMode);
      break;
    case 'remove':
      handleWebhookRemove(args.slice(1), configFile, jsonMode);
      break;
    case 'list':
      handleWebhookList(configFile, jsonMode);
      break;
    case 'test':
      handleWebhookTest(args.slice(1), configFile, jsonMode);
      break;
    default:
      console.error(`Unknown webhooks subcommand: ${subcommand}`);
      process.exit(1);
  }
}

function handleWebhookAdd(args: string[], configFile: string, jsonMode: boolean): void {
  const urlIdx = args.indexOf('--url');
  const url = urlIdx >= 0 && args[urlIdx + 1] ? args[urlIdx + 1] : undefined;

  if (!url) {
    console.error('Usage: tinyflag webhooks add --url <url> [--id <id>] [--secret <key>]');
    process.exit(1);
  }

  const idIdx = args.indexOf('--id');
  const id = idIdx >= 0 && args[idIdx + 1] ? args[idIdx + 1] : `wh-${Date.now().toString(36)}`;

  const secretIdx = args.indexOf('--secret');
  const secret = secretIdx >= 0 && args[secretIdx + 1] ? args[secretIdx + 1] : undefined;

  const config = loadWebhooksConfig(configFile);
  const endpoint: WebhookEndpoint = { id, url, secret, active: true };
  config.endpoints.push(endpoint);
  saveWebhooksConfig(configFile, config);

  if (jsonMode) {
    console.log(JSON.stringify(endpoint, null, 2));
  } else {
    console.log(`✅ Added webhook "${id}" → ${url}`);
  }
}

function handleWebhookRemove(args: string[], configFile: string, jsonMode: boolean): void {
  const id = args[0];
  if (!id) {
    console.error('Usage: tinyflag webhooks remove <id>');
    process.exit(1);
  }

  const config = loadWebhooksConfig(configFile);
  const idx = config.endpoints.findIndex((ep) => ep.id === id);
  if (idx === -1) {
    console.error(`Webhook "${id}" not found`);
    process.exit(1);
  }

  config.endpoints.splice(idx, 1);
  saveWebhooksConfig(configFile, config);

  if (jsonMode) {
    console.log(JSON.stringify({ removed: id }));
  } else {
    console.log(`🗑️  Removed webhook "${id}"`);
  }
}

function handleWebhookList(configFile: string, jsonMode: boolean): void {
  const config = loadWebhooksConfig(configFile);

  if (jsonMode) {
    console.log(JSON.stringify(config.endpoints, null, 2));
    return;
  }

  if (config.endpoints.length === 0) {
    console.log('No webhook endpoints configured.');
    console.log('Add one: tinyflag webhooks add --url https://example.com/webhook');
    return;
  }

  console.log('Webhook Endpoints:');
  console.log('═'.repeat(60));
  for (const ep of config.endpoints) {
    const status = ep.active ? '🟢' : '⚪';
    const secure = ep.secret ? '🔒' : '  ';
    console.log(`  ${status} ${secure} ${ep.id}`);
    console.log(`       URL: ${ep.url}`);
    if (ep.filter?.types?.length) {
      console.log(`       Types: ${ep.filter.types.join(', ')}`);
    }
  }
}

function handleWebhookTest(args: string[], configFile: string, jsonMode: boolean): void {
  const id = args[0];
  if (!id) {
    console.error('Usage: tinyflag webhooks test <id>');
    process.exit(1);
  }

  const config = loadWebhooksConfig(configFile);
  const endpoint = config.endpoints.find((ep) => ep.id === id);
  if (!endpoint) {
    console.error(`Webhook "${id}" not found`);
    process.exit(1);
  }

  const engine = new WebhookEngine();
  engine.addEndpoint(endpoint);

  engine.testEndpoint(id).then((result) => {
    if (jsonMode) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      if (result.success) {
        console.log(`✅ Webhook "${id}" responded with ${result.statusCode}`);
      } else {
        console.log(`❌ Webhook "${id}" failed: ${result.error || `HTTP ${result.statusCode}`}`);
      }
    }
  });
}
