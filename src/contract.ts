export type JsonObject = Record<string, unknown>

export function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export interface Contract {
  policy: { id: string; version: string }
  sdk: { version: string }
  /** Field schemas per template kind (JSON Schema). */
  kinds: Record<string, { schema: JsonObject }>
  hooks: Record<string, { title?: string }>
  /** Argument schemas per policy function (JSON Schema). */
  functions: Record<string, { title?: string; args: JsonObject }>
}

export type ContractResult = { contract: Contract } | { error: string }

function stringField(source: JsonObject, key: string, where: string): string | { error: string } {
  const value = source[key]
  return typeof value === 'string' && value !== '' ? value : { error: `${where}.${key} must be a non-empty string` }
}

/** Checks the shape of a parsed contract.json. Schemas inside it are checked later, when compiled. */
export function parseContract(input: unknown): ContractResult {
  if (!isRecord(input)) return { error: 'contract must be a JSON object' }

  const policy = input.policy
  const sdk = input.sdk
  if (!isRecord(policy)) return { error: 'policy must be an object' }
  if (!isRecord(sdk)) return { error: 'sdk must be an object' }
  const policyId = stringField(policy, 'id', 'policy')
  if (typeof policyId !== 'string') return policyId
  const policyVersion = stringField(policy, 'version', 'policy')
  if (typeof policyVersion !== 'string') return policyVersion
  const sdkVersion = stringField(sdk, 'version', 'sdk')
  if (typeof sdkVersion !== 'string') return sdkVersion

  const kinds: Contract['kinds'] = {}
  if (!isRecord(input.kinds)) return { error: 'kinds must be an object' }
  for (const [name, kind] of Object.entries(input.kinds)) {
    if (!isRecord(kind) || !isRecord(kind.schema)) return { error: `kinds.${name}.schema must be an object` }
    kinds[name] = { schema: kind.schema }
  }

  const hooks: Contract['hooks'] = {}
  if (!isRecord(input.hooks)) return { error: 'hooks must be an object' }
  for (const [name, hook] of Object.entries(input.hooks)) {
    if (!isRecord(hook)) return { error: `hooks.${name} must be an object` }
    hooks[name] = typeof hook.title === 'string' ? { title: hook.title } : {}
  }

  const functions: Contract['functions'] = {}
  if (!isRecord(input.functions)) return { error: 'functions must be an object' }
  for (const [name, fn] of Object.entries(input.functions)) {
    if (!isRecord(fn)) return { error: `functions.${name} must be an object` }
    if (fn.args !== undefined && !isRecord(fn.args)) return { error: `functions.${name}.args must be an object` }
    functions[name] = {
      ...(typeof fn.title === 'string' ? { title: fn.title } : {}),
      args: isRecord(fn.args) ? fn.args : { type: 'object', properties: {} },
    }
  }

  return { contract: { policy: { id: policyId, version: policyVersion }, sdk: { version: sdkVersion }, kinds, hooks, functions } }
}
