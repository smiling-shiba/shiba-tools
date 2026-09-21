// A minimal stand-in for the SDK, so these tests do not depend on another repository.
// It provides only what `sht build-policy` relies on: a default-exported policy with an
// `id` and a `contract(options)` method.
interface ContractOptions {
  version: string
  sha256?: string
}

export function definePolicy(definition: { id: string }) {
  return {
    id: definition.id,
    contract: (options: ContractOptions) => ({
      policy: { id: definition.id, version: options.version, ...(options.sha256 === undefined ? {} : { sha256: options.sha256 }) },
      sdk: { version: '0.0.0-test' },
      kinds: { thing: { schema: { type: 'object', properties: {} } } },
      hooks: {},
      functions: {},
    }),
  }
}
