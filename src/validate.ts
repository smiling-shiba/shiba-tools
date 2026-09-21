import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import Ajv from 'ajv'
import type { ErrorObject, ValidateFunction } from 'ajv'
import addFormats from 'ajv-formats'
import { isRecord } from './contract.ts'
import type { Contract, JsonObject } from './contract.ts'
import { sortDiagnostics } from './diagnostics.ts'
import type { Diagnostic } from './diagnostics.ts'
import { expandGlob } from './glob.ts'
import { loadContract, readPackConfig } from './pack.ts'
import { Report } from './report.ts'
import type { Located } from './report.ts'
import { didYouMean } from './suggest.ts'
import { satisfies } from './version-range.ts'
import { parseYamlSource } from './yaml-source.ts'
import type { PathSegment } from './yaml-source.ts'

/*
 * Diagnostic codes. The SH prefix is a placeholder until a real scheme is chosen.
 *   SH01x  pack.yml and contract problems      SH1xx  kinds, hooks, functions
 *   SH2xx  unknown or invalid fields/arguments  SH3xx  references and ids
 *   SH5xx  compatibility
 */
const FRAMEWORK_FIELDS = ['kind', 'id', 'on', 'do'] as const

function createAjv(): Ajv {
  const ajv = new Ajv({ allErrors: true })
  addFormats(ajv)
  ajv.addKeyword('x-shiba-ref')
  return ajv
}

interface Validators {
  kinds: Map<string, ValidateFunction>
  functions: Map<string, ValidateFunction>
}

function compileSchemas(contract: Contract, contractFile: string, report: Report): Validators {
  const ajv = createAjv()
  const validators: Validators = { kinds: new Map(), functions: new Map() }
  const compile = (label: string, schema: JsonObject, into: Map<string, ValidateFunction>, name: string): void => {
    try {
      into.set(name, ajv.compile(schema))
    } catch (error) {
      report.plain(contractFile, 'error', 'SH012', `Schema for ${label} "${name}" is invalid: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  for (const [name, kind] of Object.entries(contract.kinds)) compile('kind', kind.schema, validators.kinds, name)
  for (const [name, fn] of Object.entries(contract.functions)) compile('function', fn.args, validators.functions, name)
  return validators
}

function pointerToPath(pointer: string): PathSegment[] {
  if (pointer === '') return []
  return pointer.slice(1).split('/').map((segment) => {
    const text = segment.replace(/~1/g, '/').replace(/~0/g, '~')
    return /^\d+$/.test(text) ? Number(text) : text
  })
}

function valueAt(data: unknown, path: readonly PathSegment[]): unknown {
  let current = data
  for (const segment of path) {
    if (Array.isArray(current) && typeof segment === 'number') current = current[segment]
    else if (isRecord(current)) current = current[String(segment)]
    else return undefined
  }
  return current
}

interface ObjectRules {
  noun: 'field' | 'argument'
  unknownCode: string
  violationCode: string
  /** Keys that are valid in addition to the schema's properties. */
  alsoKnown: readonly string[]
}

/** Rejects unknown keys, then checks the known ones against the JSON Schema. */
function checkObject(where: Located, report: Report, data: JsonObject, path: readonly PathSegment[], schema: JsonObject, validator: ValidateFunction | undefined, rules: ObjectRules): void {
  const properties = isRecord(schema.properties) ? Object.keys(schema.properties) : []
  const known = [...properties, ...rules.alsoKnown]
  const subset: JsonObject = {}
  for (const key of Object.keys(data)) {
    if (properties.includes(key)) subset[key] = data[key]
    else if (!rules.alsoKnown.includes(key)) {
      report.at(where, [...path, key], 'key', 'error', rules.unknownCode, `Unknown ${rules.noun} "${key}"`, didYouMean(key, known))
    }
  }
  if (!validator || validator(subset)) return
  for (const error of validator.errors ?? []) reportSchemaError(where, report, error, subset, path, rules)
}

function reportSchemaError(where: Located, report: Report, error: ErrorObject, subset: JsonObject, base: readonly PathSegment[], rules: ObjectRules): void {
  const relative = pointerToPath(error.instancePath)
  const fullPath = [...base, ...relative]
  if (error.keyword === 'required') {
    const missing: unknown = error.params.missingProperty
    report.at(where, fullPath, 'value', 'error', rules.violationCode, `Missing required ${rules.noun} "${String(missing)}"`)
    return
  }
  const name = relative.join('.') || '(value)'
  const actual = valueAt(subset, relative)
  const got = actual === undefined ? '' : ` (got ${JSON.stringify(actual)})`
  report.at(where, fullPath, 'value', 'error', rules.violationCode, `${rules.noun === 'field' ? 'Field' : 'Argument'} "${name}" ${error.message ?? 'is invalid'}${got}`)
}

interface Template extends Located {
  data: JsonObject
  kind: string
  id: string
}

function checkSteps(template: Template, report: Report, contract: Contract, validators: Validators): void {
  const { data } = template
  const hookNames = Object.keys(contract.hooks)

  if (data.on !== undefined) {
    if (typeof data.on !== 'string') report.at(template, ['on'], 'value', 'error', 'SH102', '"on" must be a hook name')
    else if (!(data.on in contract.hooks)) report.at(template, ['on'], 'value', 'error', 'SH102', `Unknown hook "${data.on}"`, didYouMean(data.on, hookNames))
  }
  if ((data.on === undefined) !== (data.do === undefined)) {
    const present = data.on === undefined ? 'do' : 'on'
    const missing = present === 'on' ? 'do' : 'on'
    report.at(template, [present], 'key', 'error', 'SH103', `"${present}" needs a matching "${missing}"`)
  }
  if (data.do === undefined) return
  if (!Array.isArray(data.do)) {
    report.at(template, ['do'], 'value', 'error', 'SH104', '"do" must be a list of steps')
    return
  }
  const functionNames = Object.keys(contract.functions)
  for (const [index, step] of data.do.entries()) {
    const stepPath: PathSegment[] = ['do', index]
    if (!isRecord(step)) {
      report.at(template, stepPath, 'value', 'error', 'SH104', 'Each step must be a mapping with an "fn"')
      continue
    }
    for (const key of Object.keys(step)) {
      if (key !== 'fn' && key !== 'args') report.at(template, [...stepPath, key], 'key', 'error', 'SH105', `Unknown step field "${key}"`, didYouMean(key, ['fn', 'args']))
    }
    if (typeof step.fn !== 'string') {
      report.at(template, stepPath, 'value', 'error', 'SH104', 'Step is missing "fn" (the policy function to call)')
      continue
    }
    const contractFn = contract.functions[step.fn]
    if (!contractFn) {
      report.at(template, [...stepPath, 'fn'], 'value', 'error', 'SH101', `Unknown function "${step.fn}"`, didYouMean(step.fn, functionNames))
      continue
    }
    const args = step.args ?? {}
    if (!isRecord(args)) {
      report.at(template, [...stepPath, 'args'], 'value', 'error', 'SH104', '"args" must be a mapping')
      continue
    }
    checkObject(template, report, args, [...stepPath, 'args'], contractFn.args, validators.functions.get(step.fn), {
      noun: 'argument', unknownCode: 'SH202', violationCode: 'SH204', alsoKnown: [],
    })
  }
}

function checkReferences(template: Template, report: Report, kindSchema: JsonObject, idsByKind: Map<string, Set<string>>): void {
  if (!isRecord(kindSchema.properties)) return
  const check = (refKind: string, value: unknown, path: PathSegment[]): void => {
    const ids = idsByKind.get(refKind) ?? new Set<string>()
    if (typeof value === 'string' && !ids.has(value)) {
      report.at(template, path, 'value', 'error', 'SH301', `Unknown ${refKind} "${value}"`, didYouMean(value, ids))
    }
  }
  for (const [name, property] of Object.entries(kindSchema.properties)) {
    const value = template.data[name]
    if (!isRecord(property) || value === undefined) continue
    const direct = property['x-shiba-ref']
    const items = isRecord(property.items) ? property.items['x-shiba-ref'] : undefined
    if (typeof direct === 'string') check(direct, value, [name])
    else if (typeof items === 'string' && Array.isArray(value)) value.forEach((entry: unknown, index) => check(items, entry, [name, index]))
  }
}

function loadTemplates(packDir: string, files: readonly string[], contract: Contract, report: Report): Template[] {
  const templates: Template[] = []
  const seen = new Map<string, string>()
  for (const file of files) {
    const where: Located = { file, source: parseYamlSource(readFileSync(join(packDir, file), 'utf8')) }
    if (report.syntax(where)) continue
    const data = where.source.value
    if (!isRecord(data)) {
      report.at(where, [], 'value', 'error', 'SH120', 'A template must be a mapping with "kind" and "id"')
      continue
    }
    const { kind, id } = data
    if (typeof kind !== 'string') {
      report.at(where, kind === undefined ? [] : ['kind'], 'value', 'error', 'SH120', kind === undefined ? 'Missing required field "kind"' : '"kind" must be text')
      continue
    }
    if (!(kind in contract.kinds)) {
      report.at(where, ['kind'], 'value', 'error', 'SH110', `Unknown kind "${kind}"`, didYouMean(kind, Object.keys(contract.kinds)))
      continue
    }
    if (typeof id !== 'string' || id === '') {
      report.at(where, id === undefined ? [] : ['id'], 'value', 'error', 'SH121', id === undefined ? 'Missing required field "id"' : '"id" must be non-empty text')
      continue
    }
    const key = `${kind}:${id}`
    const first = seen.get(key)
    if (first !== undefined) {
      report.at(where, ['id'], 'value', 'error', 'SH302', `Duplicate ${kind} id "${id}" (first defined in ${first})`)
      continue
    }
    seen.set(key, file)
    templates.push({ ...where, data, kind, id })
  }
  return templates
}

/** Validates a pack directory and returns every problem found, sorted by file and position. */
export function validatePack(packDir: string): Diagnostic[] {
  const report = new Report()
  const loaded = readPackConfig(packDir, report)
  if (!loaded) return sortDiagnostics(report.items)
  const { where: pack, config } = loaded

  const contract = loadContract(packDir, config, pack, report)
  if (!contract) return sortDiagnostics(report.items)

  const compatible = satisfies(contract.sdk.version, config.sdkRange)
  if (compatible === undefined) {
    report.at(pack, ['sdk', 'range'], 'value', 'error', 'SH501', `Cannot compare SDK version "${contract.sdk.version}" with range "${config.sdkRange}" (use versions like ">=0.1.0 <0.2.0")`)
  } else if (!compatible) {
    report.at(pack, ['sdk', 'range'], 'value', 'error', 'SH501', `SDK ${contract.sdk.version} does not satisfy "${config.sdkRange}"`)
  }

  const validators = compileSchemas(contract, `policies/${config.policy}.contract.json`, report)
  const files = expandGlob(packDir, config.templates)
  if (files.length === 0) report.at(pack, ['templates'], 'value', 'warning', 'SH016', `No files match templates pattern "${config.templates}"`)

  const templates = loadTemplates(packDir, files, contract, report)
  const idsByKind = new Map<string, Set<string>>()
  for (const template of templates) {
    const ids = idsByKind.get(template.kind) ?? new Set<string>()
    ids.add(template.id)
    idsByKind.set(template.kind, ids)
  }

  for (const template of templates) {
    const kind = contract.kinds[template.kind]
    if (!kind) continue
    checkObject(template, report, template.data, [], kind.schema, validators.kinds.get(template.kind), {
      noun: 'field', unknownCode: 'SH201', violationCode: 'SH203', alsoKnown: FRAMEWORK_FIELDS,
    })
    checkReferences(template, report, kind.schema, idsByKind)
    checkSteps(template, report, contract, validators)
  }
  return sortDiagnostics(report.items)
}
