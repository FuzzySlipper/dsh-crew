/** JSON-only records crossing the local fabric boundary. */

export interface Lease { adapter_id: string; instance_id: string; lease_token: string; expires_at: string }
export interface Binding { address: string; bound: boolean; adapter_id?: string; target_ref?: string; capabilities: string[]; revision: number; generation: number }
export interface Message { message_id: string; sender_address: string; recipient_address: string; body: string; reply_to_message_id?: string }
export interface Delivery { delivery_id: string; message_id: string; recipient_address: string; recipient_generation: number; state: string; claim_owner_adapter_id?: string; native_attempt_ref?: string }
/** Exact `/v1/deliveries/claim` result: `claimed` is false for no-work receipts. */
export interface Claim { claimed: boolean; reason?: string; delivery?: Delivery; message?: Message; head?: Delivery; claim_token?: string; dispatch_action?: string; replayed: boolean }

export const capabilities = ['deliver_when_idle', 'durable_next_turn', 'wake_inactive'] as const

/** Stable operation identities never contain the lease token. */
export function operation(deliveryId: string, action: string): string { return `dsh-crew:${deliveryId}:${action}` }
export function nativeAttempt(deliveryId: string): string { return `dsh-crew:${deliveryId}:native` }
