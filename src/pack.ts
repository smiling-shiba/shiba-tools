import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isRecord, parseContract } from './contract.ts'
import type { Contract, JsonObject } from './contract.ts'
import { expandGlob } from './glob.ts'
import { Report } from './report.ts'
import type { Located } from './report.ts'
import { didYouMean } from './suggest.ts'
import { parseYamlSource } from './yaml-source.ts'
import type { PathSegment } from './yaml-source.ts'

export const PACK_FILE = 'pack.yml'
const PACK_FIELDS = ['id', 'version', 'policy', 'sdk', 'templates', 'assets']
const POLICY_NAME = /^[A-Za-z0-9._-]+$/

export interface PackConfig {
  policy: string
  sdkRange: string
  templates: string
}

export function readPackConfig(packDir: string, report: Report): { where: Located; config: PackConfig } | undefined {
  const path = join(packDir, PACK_FILE)
  if (!existsSync(path)) {
    report.plain(PACK_FILE, 'error', 'SH011', `${PACK_FILE} not found in ${packDir}`)
    return undefined
  }
  const where: Located = { file: PACK_FILE, source: parseYamlSource(readFileSync(path, 'utf8')) }
  if (report.syntax(where)) return undefined
  const data = where.source.value
  if (!isRecord(data)) {
    report.at(where, [], 'value', 'error', 'SH011', `${PACK_FILE} must be a mapping of fields`)
    return undefined
  }

  let valid = true
  const requireString = (key: string, path: PathSegment[], source: JsonObject): string => {
    const value = source[key]
    if (typeof value === 'string' && value !== '') return value
    valid = false
    report.at(where, value === undefined ? path.slice(0, -1) : path, 'value', 'error', 'SH011',
      value === undefined ? `Missing required field "${path.join('.')}"` : `"${path.join('.')}" must be a non-empty string`)
    return ''
  }

  for (const key of Object.keys(data)) {
    if (!PACK_FIELDS.includes(key)) {
      report.at(where, [key], 'key', 'error', 'SH013', `Unknown ${PACK_FILE} field "${key}"`, didYouMean(key, PACK_FIELDS))
      valid = false
    }
  }
  requireString('id', ['id'], data)
  requireString('version', ['version'], data)
  const policy = requireString('policy', ['policy'], data)
  const templates = requireString('templates', ['templates'], data)
  let sdkRange = ''
  if (isRecord(data.sdk)) {
    for (const key of Object.keys(data.sdk)) {
      if (key !== 'range') {
        report.at(where, ['sdk', key], 'key', 'error', 'SH013', `Unknown ${PACK_FILE} field "sdk.${key}"`, didYouMean(key, ['range']))
        valid = false
      }
    }
    sdkRange = requireString('range', ['sdk', 'range'], data.sdk)
  } else {
    valid = false
    report.at(where, data.sdk === undefined ? [] : ['sdk'], 'value', 'error', 'SH011',
      data.sdk === undefined ? 'Missing required field "sdk"' : '"sdk" must be a mapping with a "range"')
  }
  return valid ? { where, config: { policy, sdkRange, templates } } : undefined
}

export function loadContract(packDir: string, config: PackConfig, pack: Located, report: Report): Contract | undefined {
  if (!POLICY_NAME.test(config.policy)) {
    report.at(pack, ['policy'], 'value', 'error', 'SH012', `"policy" must be a file name without a path (got "${config.policy}")`)
    return undefined
  }
  const contractFile = `policies/${config.policy}.contract.json`
  const contractPath = join(packDir, contractFile)
  if (!existsSync(contractPath)) {
    report.at(pack, ['policy'], 'value', 'error', 'SH012', `Contract not found: ${contractFile}`)
    return undefined
  }
  let json: unknown
  try {
    json = JSON.parse(readFileSync(contractPath, 'utf8'))
  } catch (error) {
    report.plain(contractFile, 'error', 'SH012', `Contract is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
    return undefined
  }
  const parsed = parseContract(json)
  if ('error' in parsed) {
    report.plain(contractFile, 'error', 'SH012', `Contract is invalid: ${parsed.error}`)
    return undefined
  }
  const { contract } = parsed
  if (!existsSync(join(packDir, `policies/${config.policy}.js`))) {
    report.at(pack, ['policy'], 'value', 'warning', 'SH014', `Policy bundle not found: policies/${config.policy}.js`)
  }
  const expectedName = `${contract.policy.id}-policy-${contract.policy.version}`
  if (config.policy !== expectedName) {
    report.at(pack, ['policy'], 'value', 'warning', 'SH015', `Policy name "${config.policy}" does not match its contract (expected "${expectedName}")`)
  }
  return contract
}


/** Ids of every well-formed template, by kind. Files with problems are skipped; `validate` reports those. */
export function collectTemplateIds(packDir: string, templatesPattern: string): Map<string, string[]> {
  const ids = new Map<string, string[]>()
  for (const file of expandGlob(packDir, templatesPattern)) {
    const source = parseYamlSource(readFileSync(join(packDir, file), 'utf8'))
    const data = source.value
    if (!isRecord(data) || typeof data.kind !== 'string' || typeof data.id !== 'string') continue
    const list = ids.get(data.kind) ?? []
    if (!list.includes(data.id)) list.push(data.id)
    ids.set(data.kind, list)
  }
  for (const list of ids.values()) list.sort()
  return ids
}

/** Names of the policies available in `policies/`, taken from their contract files. */
export function listPolicyNames(packDir: string): string[] {
  try {
    return readdirSync(join(packDir, 'policies'))
      .filter((name) => name.endsWith('.contract.json'))
      .map((name) => name.slice(0, -'.contract.json'.length))
      .sort()
  } catch {
    return []
  }
}
