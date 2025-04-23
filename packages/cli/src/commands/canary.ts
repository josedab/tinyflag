import {
  CanaryController,
  createPrometheusAdapter,
  createDatadogAdapter,
  formatCanaryState,
} from '../canary.js';

export function handleCanary(args: string[], jsonMode: boolean): void {
  const flagName = args[0];
  if (!flagName) {
    console.error(
      'Usage: tinyflag canary <flag> --adapter <prometheus|datadog> --url <metrics-url> [--threshold <0.05>]',
    );
    process.exit(1);
  }

  const adapterIdx = args.indexOf('--adapter');
  const adapterName = adapterIdx >= 0 && args[adapterIdx + 1] ? args[adapterIdx + 1] : 'prometheus';

  const urlIdx = args.indexOf('--url');
  const metricsUrl = urlIdx >= 0 && args[urlIdx + 1] ? args[urlIdx + 1] : 'http://localhost:9090';

  const thresholdIdx = args.indexOf('--threshold');
  const threshold =
    thresholdIdx >= 0 && args[thresholdIdx + 1] ? parseFloat(args[thresholdIdx + 1]) : 0.05;

  const stagesIdx = args.indexOf('--stages');
  const stages =
    stagesIdx >= 0 && args[stagesIdx + 1]
      ? args[stagesIdx + 1].split(',').map(Number)
      : [1, 5, 25, 50, 100];

  let adapter;
  switch (adapterName) {
    case 'datadog': {
      const apiKey = process.env.DD_API_KEY || '';
      const appKey = process.env.DD_APP_KEY || '';
      adapter = createDatadogAdapter(apiKey, appKey);
      break;
    }
    case 'prometheus':
    default:
      adapter = createPrometheusAdapter(metricsUrl);
      break;
  }

  const controller = new CanaryController(
    {
      flag: flagName,
      metricsAdapter: adapter,
      errorThreshold: threshold,
      stages,
      stageInterval: 300,
      gracePeriod: 300,
      confirmationWindow: 3,
    },
    (flag, pct) => {
      console.log(`  → Updated ${flag} rollout to ${pct}%`);
    },
  );

  if (jsonMode) {
    console.log(JSON.stringify(controller.getState(), null, 2));
  } else {
    console.log(formatCanaryState(controller.getState()));
    console.log('');
    console.log('Canary controller initialized. Use the canary API to run check/advance cycles.');
    console.log(`  Stages: ${stages.join('% → ')}%`);
    console.log(`  Threshold: ${(threshold * 100).toFixed(1)}% error rate`);
    console.log(`  Adapter: ${adapterName} (${metricsUrl})`);
  }
}
