import { writeFileSync, readFileSync, existsSync } from 'fs';
import { dirname } from 'path';
import {
  generateTypes,
  generateOpenAPISpec,
  generateGraphQLSchema,
  checkGeneratedTypes,
} from '../generate.js';
import { loadAndValidate } from './utils.js';

export function handleGenerate(args: string[], jsonMode: boolean): void {
  const checkMode = args.includes('--check');
  const openApiMode = args.includes('--openapi');
  const graphqlMode = args.includes('--graphql');
  const filteredArgs = args.filter((a) => !a.startsWith('--'));

  const filePath = filteredArgs[0];
  if (!filePath) {
    console.error('Error: Missing flags file path\n');
    console.log('Usage: tinyflag generate <file> [-o <output>] [--openapi] [--graphql] [--check]');
    process.exit(1);
  }

  const outputIdx = args.indexOf('-o');
  const outputPath = outputIdx !== -1 ? args[outputIdx + 1] : undefined;

  const config = loadAndValidate(filePath);

  if (jsonMode) {
    console.log(
      JSON.stringify({ command: 'generate', file: filePath, flags: config.flags }, null, 2),
    );
    return;
  }

  // --check mode: verify generated types are up-to-date
  if (checkMode) {
    if (!outputPath) {
      console.error('Error: --check requires -o <output> to specify the file to check against');
      process.exit(1);
    }
    if (!existsSync(outputPath)) {
      console.error(`❌ Generated types file not found: ${outputPath}`);
      console.error('Run "tinyflag generate" first to create it.');
      process.exit(1);
    }
    const existing = readFileSync(outputPath, 'utf-8');
    const result = checkGeneratedTypes(config, existing);
    if (result.stale) {
      console.error(`❌ Generated types are stale: ${outputPath}`);
      console.error('Run "tinyflag generate" to update.');
      process.exit(1);
    }
    console.log(`✅ Generated types are up-to-date: ${outputPath}`);
    return;
  }

  // OpenAPI mode
  if (openApiMode) {
    const spec = generateOpenAPISpec(config);
    const output = JSON.stringify(spec, null, 2);
    if (outputPath) {
      const dir = dirname(outputPath);
      if (!existsSync(dir)) {
        console.error(`Error: Directory "${dir}" does not exist. Create it first.`);
        process.exit(1);
      }
      writeFileSync(outputPath, output, 'utf-8');
      console.log(`✅ OpenAPI spec written to ${outputPath}`);
    } else {
      process.stdout.write(output);
    }
    return;
  }

  // GraphQL mode
  if (graphqlMode) {
    const schema = generateGraphQLSchema(config);
    if (outputPath) {
      const dir = dirname(outputPath);
      if (!existsSync(dir)) {
        console.error(`Error: Directory "${dir}" does not exist. Create it first.`);
        process.exit(1);
      }
      writeFileSync(outputPath, schema, 'utf-8');
      console.log(`✅ GraphQL schema written to ${outputPath}`);
    } else {
      process.stdout.write(schema);
    }
    return;
  }

  // Default: TypeScript types
  const types = generateTypes(config);

  if (outputPath) {
    const dir = dirname(outputPath);
    if (!existsSync(dir)) {
      console.error(`Error: Directory "${dir}" does not exist. Create it first.`);
      process.exit(1);
    }
    writeFileSync(outputPath, types, 'utf-8');
    console.log(`✅ Types written to ${outputPath}`);
  } else {
    process.stdout.write(types);
  }
}
