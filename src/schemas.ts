import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { isRecord } from './contract.ts'
import type { Contract, JsonObject } from './contract.ts'
import { sortDiagnostics } from './diagnostics.ts'
import type { Diagnostic } from './diagnostics.ts'
import { collectTemplateIds, listPolicyNames, loadContract, readPackConfig } from './pack.ts'
import { Report } from './report.ts'

export const TEMPLATE_SCHEMA_FILE = '.shiba/template.schema.json'
export const PACK_SCHEMA_FILE = '.shiba/pack.schema.json'
export const VSCODE_SETTINGS_FILE = '.vscode/settings.json'

/** The mapping that connects the generated schemas to the files they describe. */
export const VSCODE_SETTINGS = {
  'yaml.schemas': {
    [TEMPLATE_SCHEMA_FILE]: '**/templates/**/*.yml',
    [PACK_SCHEMA_FILE]: '**/pack.yml',
  },
}

const DRAFT_07 = 'http://json-schema.org/draft-07/schema#'

type IdsByKind = ReadonlyMap<string, readonly string[]>

/** Copies a schema, adding a list of known ids wherever a field is marked "x-shiba-ref". */
function withReferenceIds(value: unknown, idsByKind: IdsByKind): unknown {
  if (Array.isArray(value)) return value.map((item: unknown) => withReferenceIds(item, idsByKind))
  if (!isRecord(value)) return value
  const copy: JsonObject = {}
  for (const [key, inner] of Object.entries(value)) copy[key] = withReferenceIds(inner, idsByKind)
  const refKind = value['x-shiba-ref']
  const ids = typeof refKind === 'string' ? idsByKind.get(refKind) : undefined
  if (ids !== undefined && ids.length > 0 && copy.enum === undefined) copy.enum = [...ids]
  return copy
}

function asObject(value: unknown): JsonObject {
  return isRecord(value) ? value : {}
}

/** A snippet placeholder for one required property, chosen by its JSON Schema type. */
function placeholder(name: string, schema: unknown, tabstop: number): unknown {
  const type = isRecord(schema) ? schema.type : undefined
  if (type === 'array') return [`\${${tabstop}:${name}}`]
  if (type === 'object') return {}
  if (type === 'integer' || type === 'number') return `\${${tabstop}:0}`
  if (type === 'boolean') return `\${${tabstop}|true,false|}`
  return `\${${tabstop}:${name}}`
}

/** Snippet body containing every required property of `schema`, after the fixed `lead` fields. */
function requiredBody(schema: JsonObject, lead: JsonObject, firstTabstop: number, skip: readonly string[] = []): JsonObject {
  const body: JsonObject = { ...lead }
  const properties = asObject(schema.properties)
  const required = Array.isArray(schema.required) ? schema.required : []
  let tabstop = firstTabstop
  for (const name of required) {
    if (typeof name !== 'string' || skip.includes(name)) continue
    body[name] = placeholder(name, properties[name], tabstop)
    tabstop += 1
  }
  return body
}

function stepSchema(contract: Contract, idsByKind: IdsByKind): JsonObject {
  const names = Object.keys(contract.functions).sort()
  const titles = names.map((name) => contract.functions[name]?.title ?? name)
  return {
    type: 'object',
    description: 'One step: a call to a policy function.',
    required: ['fn'],
    additionalProperties: false,
    properties: {
      fn: {
        type: 'string',
        description: 'The policy function to call.',
        ...(names.length > 0 ? { enum: names } : {}),
        enumDescriptions: titles,
        markdownEnumDescriptions: titles,
      },
      args: { type: 'object', description: 'Arguments for the function.' },
    },
    allOf: names.map((name) => ({
      if: { properties: { fn: { const: name } }, required: ['fn'] },
      then: { properties: { args: { ...asObject(withReferenceIds(contract.functions[name]?.args, idsByKind)), additionalProperties: false } } },
    })),
    defaultSnippets: names.map((name) => {
      const args = requiredBody(asObject(contract.functions[name]?.args), {}, 1)
      return {
        label: name,
        description: contract.functions[name]?.title ?? name,
        body: Object.keys(args).length > 0 ? { fn: name, args } : { fn: name },
      }
    }),
  }
}

function kindBranch(name: string, contract: Contract, idsByKind: IdsByKind): JsonObject {
  const kindSchema = asObject(withReferenceIds(contract.kinds[name]?.schema, idsByKind))
  const hookNames = Object.keys(contract.hooks).sort()
  const hookTitles = hookNames.map((hook) => contract.hooks[hook]?.title ?? hook)
  const required = Array.isArray(kindSchema.required) ? kindSchema.required.filter((item): item is string => typeof item === 'string') : []
  return {
    if: { properties: { kind: { const: name } }, required: ['kind'] },
    then: {
      properties: {
        kind: { const: name },
        id: { type: 'string', minLength: 1, description: 'Unique name for this template within its kind.' },
        on: {
          type: 'string',
          description: 'The hook that triggers the steps in "do".',
          ...(hookNames.length > 0 ? { enum: hookNames } : {}),
          enumDescriptions: hookTitles,
          markdownEnumDescriptions: hookTitles,
        },
        do: { type: 'array', description: 'Steps to run when the hook fires.', items: stepSchema(contract, idsByKind) },
        ...asObject(kindSchema.properties),
      },
      required: [...new Set(['kind', 'id', ...required])],
      additionalProperties: false,
      dependencies: { on: ['do'], do: ['on'] },
    },
  }
}

/**
 * One JSON Schema for every template. It switches on "kind", so the editor offers
 * the right fields, hooks, functions and arguments for the kind being written.
 */
export function buildTemplateSchema(contract: Contract, idsByKind: IdsByKind): JsonObject {
  const kindNames = Object.keys(contract.kinds).sort()
  return {
    $schema: DRAFT_07,
    title: `Shiba template (${contract.policy.id} ${contract.policy.version})`,
    description: 'Generated by "sht schemas". Re-run it after changing the policy or adding templates.',
    type: 'object',
    required: ['kind'],
    properties: {
      kind: {
        type: 'string',
        description: 'Which kind of template this file defines.',
        ...(kindNames.length > 0 ? { enum: kindNames } : {}),
      },
    },
    allOf: kindNames.map((name) => kindBranch(name, contract, idsByKind)),
    defaultSnippets: kindNames.map((name) => ({
      label: name,
      description: `New ${name} template`,
      body: requiredBody(asObject(contract.kinds[name]?.schema), { kind: name, id: '${1:id}' }, 2),
    })),
  }
}

/** JSON Schema for pack.yml. `policyNames` are the policies found in `policies/`. */
export function buildPackSchema(policyNames: readonly string[]): JsonObject {
  return {
    $schema: DRAFT_07,
    title: 'Shiba pack.yml',
    type: 'object',
    required: ['id', 'version', 'policy', 'sdk', 'templates'],
    additionalProperties: false,
    properties: {
      id: { type: 'string', minLength: 1, description: 'Name of this pack.' },
      version: { type: 'string', minLength: 1, description: 'Pack version (generated calver, YYYY.MM.DD.N).' },
      policy: {
        type: 'string',
        description: 'The one active policy, named as in policies/ (without the file extension).',
        ...(policyNames.length > 0 ? { enum: [...policyNames] } : {}),
      },
      sdk: {
        type: 'object',
        required: ['range'],
        additionalProperties: false,
        properties: {
          range: { type: 'string', minLength: 1, description: 'Runtime versions this pack targets.', examples: ['>=0.1.0 <0.2.0'] },
        },
      },
      templates: { type: 'string', minLength: 1, description: 'Glob for the template files.', default: 'templates/**/*.yml' },
      assets: { type: 'string', description: 'Folder holding assets.', default: 'assets/' },
    },
  }
}

export interface SchemaResult {
  /** Files written, relative to the pack directory. */
  written: string[]
  /** Whether .vscode/settings.json was created, or already existed and was left alone. */
  settings: 'created' | 'exists' | 'not-written'
  diagnostics: Diagnostic[]
}

function writeJson(packDir: string, file: string, value: unknown): void {
  const path = join(packDir, file)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

/**
 * Generates the editor schemas for a pack into `<packDir>/.shiba/`, and creates
 * `.vscode/settings.json` if there is none. An existing settings file is never modified.
 */
export function writeSchemas(packDir: string): SchemaResult {
  const report = new Report()
  const loaded = readPackConfig(packDir, report)
  const contract = loaded ? loadContract(packDir, loaded.config, loaded.where, report) : undefined
  if (!loaded || !contract) return { written: [], settings: 'not-written', diagnostics: sortDiagnostics(report.items) }

  const ids = collectTemplateIds(packDir, loaded.config.templates)
  writeJson(packDir, TEMPLATE_SCHEMA_FILE, buildTemplateSchema(contract, ids))
  writeJson(packDir, PACK_SCHEMA_FILE, buildPackSchema(listPolicyNames(packDir)))

  let settings: SchemaResult['settings'] = 'exists'
  if (!existsSync(join(packDir, VSCODE_SETTINGS_FILE))) {
    writeJson(packDir, VSCODE_SETTINGS_FILE, VSCODE_SETTINGS)
    settings = 'created'
  }
  return { written: [TEMPLATE_SCHEMA_FILE, PACK_SCHEMA_FILE], settings, diagnostics: sortDiagnostics(report.items) }
}
