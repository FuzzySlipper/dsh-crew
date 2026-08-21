import type { Binding, Claim, Delivery, Lease, Message } from './protocol.ts'

export class FabricError extends Error {
  constructor(readonly code: string, message = `fabric ${code}`) { super(message) }
}

/** Small fetch client; all validation is at this JSON/process boundary. */
export class FabricClient {
  constructor(private readonly baseUrl: string, private readonly request: typeof fetch = fetch) {}

  private async call<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const response = await this.request(new URL(path, this.baseUrl), {
      method,
      ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    })
    const value: unknown = await response.json().catch(() => ({}))
    if (!response.ok) {
      const code = typeof value === 'object' && value !== null && 'code' in value && typeof value.code === 'string' ? value.code : `http_${response.status}`
      throw new FabricError(code)
    }
    return value as T
  }

  register(adapterId: string, instanceId: string, leaseDuration: string): Promise<Lease> {
    return this.call('/v1/adapters/register', 'POST', { adapter_id: adapterId, instance_id: instanceId, lease_duration: leaseDuration })
  }
  renew(adapterId: string, leaseToken: string, leaseDuration: string): Promise<Lease> {
    return this.call('/v1/adapters/renew', 'POST', { adapter_id: adapterId, lease_token: leaseToken, lease_duration: leaseDuration })
  }
  listBindings(): Promise<{ addresses: Binding[] }> { return this.call('/v1/addresses') }
  putBinding(address: string, body: Record<string, unknown>): Promise<Binding> { return this.call(`/v1/addresses/${encodeURIComponent(address)}/binding`, 'PUT', body) }
  unbind(address: string, body: Record<string, unknown>): Promise<Binding> { return this.call(`/v1/addresses/${encodeURIComponent(address)}/binding`, 'DELETE', body) }
  submit(body: Record<string, unknown>): Promise<{ message: Message; delivery: Delivery; replayed: boolean }> { return this.call('/v1/messages', 'POST', body) }
  claim(body: Record<string, unknown>): Promise<Claim> { return this.call('/v1/deliveries/claim', 'POST', body) }
  begin(deliveryId: string, body: Record<string, unknown>): Promise<Delivery> { return this.call(`/v1/deliveries/${encodeURIComponent(deliveryId)}/begin-dispatch`, 'POST', body) }
  release(deliveryId: string, body: Record<string, unknown>): Promise<Delivery> { return this.call(`/v1/deliveries/${encodeURIComponent(deliveryId)}/release`, 'POST', body) }
  acknowledge(deliveryId: string, body: Record<string, unknown>): Promise<Delivery> { return this.call(`/v1/deliveries/${encodeURIComponent(deliveryId)}/acknowledge`, 'POST', body) }
  unknown(deliveryId: string, body: Record<string, unknown>): Promise<Delivery> { return this.call(`/v1/deliveries/${encodeURIComponent(deliveryId)}/outcome-unknown`, 'POST', body) }
  deliveries(): Promise<{ deliveries: Delivery[] }> { return this.call('/v1/deliveries') }
}
