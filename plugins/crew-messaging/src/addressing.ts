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
): { readonly all: readonly BindingConfig[]; readonly dynamic: readonly BindingConfig[] } {
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
  for (const values of grouped.values()) {
    if (values.length !== 1) continue
    const [binding] = values
    if (binding !== undefined) dynamic.push(binding)
  }
  return { all: [...configured, ...dynamic], dynamic }
}

/** Case-insensitive identity used only to reject ambiguous human aliases. */
export function addressKey(address: string): string { return address.toLowerCase() }
