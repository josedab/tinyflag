import * as pulumi from '@pulumi/pulumi';
import { readFileSync, writeFileSync, existsSync } from 'fs';

/**
 * Arguments for creating a TinyFlag feature flag via Pulumi.
 */
export interface TinyFlagArgs {
  /** Flag name (kebab-case). */
  name: pulumi.Input<string>;
  /** Whether the flag is globally enabled. */
  enabled: pulumi.Input<boolean>;
  /** Human-readable description. */
  description?: pulumi.Input<string>;
  /** Rollout percentage (0-100). */
  rollout?: pulumi.Input<number>;
  /** Categorization tags. */
  tags?: pulumi.Input<pulumi.Input<string>[]>;
  /** Path to flags file. Default: flags.yml */
  flagsFile?: pulumi.Input<string>;
}

interface FlagsDoc {
  version: number;
  flags: Record<string, Record<string, unknown>>;
}

/**
 * TinyFlag Pulumi component resource.
 * Manages a feature flag entry in a TinyFlag flags file.
 *
 * @example
 * ```typescript
 * import { TinyFlag } from '@tinyflag/pulumi';
 *
 * const flag = new TinyFlag('new-checkout', {
 *   name: 'new-checkout',
 *   enabled: true,
 *   description: 'Redesigned checkout flow',
 *   rollout: 50,
 *   tags: ['checkout', 'experiment'],
 * });
 * ```
 */
export class TinyFlag extends pulumi.ComponentResource {
  public readonly flagName: pulumi.Output<string>;
  public readonly enabled: pulumi.Output<boolean>;

  constructor(name: string, args: TinyFlagArgs, opts?: pulumi.ComponentResourceOptions) {
    super('tinyflag:index:TinyFlag', name, {}, opts);

    const flagsFile = pulumi.output(args.flagsFile ?? 'flags.yml');
    const flagName = pulumi.output(args.name);
    const enabled = pulumi.output(args.enabled);
    const description = args.description ? pulumi.output(args.description) : undefined;
    const rollout = args.rollout ? pulumi.output(args.rollout) : undefined;
    const tags = args.tags ? pulumi.output(args.tags) : undefined;

    this.flagName = flagName;
    this.enabled = enabled;

    // Create a dynamic provider to manage the flag file
    pulumi
      .all([flagsFile, flagName, enabled, description, rollout, tags])
      .apply(([file, name, en, desc, roll, t]) => {
        let doc: FlagsDoc = { version: 1, flags: {} };

        if (existsSync(file)) {
          try {
            const content = readFileSync(file, 'utf-8');
            // Simple YAML-like JSON parse for the component
            doc = JSON.parse(content);
          } catch {
            doc = { version: 1, flags: {} };
          }
        }

        const flagDef: Record<string, unknown> = { enabled: en };
        if (desc) flagDef.description = desc;
        if (roll !== undefined) flagDef.rollout = roll;
        if (t) flagDef.tags = t;

        doc.flags[name] = flagDef;

        writeFileSync(file, JSON.stringify(doc, null, 2), 'utf-8');
      });

    this.registerOutputs({
      flagName: this.flagName,
      enabled: this.enabled,
    });
  }
}
