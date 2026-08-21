import type { BindingConfig } from './service.ts'

/** One explicit-title candidate found in the DSH root-session catalog. */
export interface DiscoveredBinding extends BindingConfig {}

/**
 * Read-only address discovery owned by a runtime adapter.
 *
 * A failed scan rejects rather than returning a partial catalog: callers keep
 * their last known bindings, which prevents a transient persistence failure
 * from retiring otherwise reachable addresses.
 */
export interface AddressDiscovery {
  discover(): Promise<readonly DiscoveredBinding[]>
  onChanged(listener: () => void): () => void
}

/** A dynamic binding the adapter may retire only while its revision still matches. */
export interface ManagedDynamicBinding extends BindingConfig {
  readonly revision: number
}

/** Model-safe directory row. It deliberately excludes DSH and fabric internals. */
export interface DirectoryEntry {
  readonly address: string
  readonly status: 'routable' | 'ambiguous' | 'conflict'
  readonly source: 'configured' | 'session-title'
}

/** Desired bindings plus the human-facing status of every discovered alias. */
export interface AddressPlan {
  readonly all: readonly BindingConfig[]
  readonly dynamic: readonly BindingConfig[]
  readonly directory: readonly DirectoryEntry[]
}

/**
 * Merge explicit configuration with user-title discovery.
 *
 * Configured rows win both their session and their case-insensitive address.
 * A title shared case-insensitively by two roots is omitted entirely rather
 * than selecting whichever catalog row happened to arrive first.
 */
export function effectiveBindings(
  configured: readonly BindingConfig[],
  discovered: readonly DiscoveredBinding[],
): AddressPlan {
  const configuredAddresses = new Set(configured.map(binding => addressKey(binding.address)))
  const configuredSessions = new Set(configured.map(binding => binding.sessionId))
  const grouped = new Map<string, DiscoveredBinding[]>()
  for (const binding of discovered) {
    if (configuredAddresses.has(addressKey(binding.address)) || configuredSessions.has(binding.sessionId)) continue
    const key = addressKey(binding.address)
    const values = grouped.get(key) ?? []
    values.push(binding)
    grouped.set(key, values)
  }
  const dynamic: BindingConfig[] = []
  const directory: DirectoryEntry[] = configured.map(binding => ({ address: binding.address, status: 'routable', source: 'configured' }))
  for (const values of grouped.values()) {
    if (values.length !== 1) {
      const address = values.map(binding => binding.address).sort()[0]
      if (address !== undefined) directory.push({ address, status: 'ambiguous', source: 'session-title' })
      continue
    }
    const [binding] = values
    if (binding !== undefined) {
      dynamic.push(binding)
      directory.push({ address: binding.address, status: 'routable', source: 'session-title' })
    }
  }
  return { all: [...configured, ...dynamic], dynamic, directory }
}

/** Case-insensitive identity used only to reject ambiguous human aliases. */
export function addressKey(address: string): string { return address.toLowerCase() }
