import type { Message } from './protocol.ts'

/**
 * Render one fabric envelope as model-visible text without exposing adapter
 * targets or DSH session ids. The body is a standalone JSON string, so its
 * contents cannot become a second metadata record or delimiter.
 */
export function frameCrewDelivery(message: Message): string {
  const header = message.reply_to_message_id === undefined
    ? { type: 'crew_delivery', message_id: message.message_id, from: message.sender_address, to: message.recipient_address, kind: 'ordinary' }
    : { type: 'crew_delivery', message_id: message.message_id, from: message.sender_address, to: message.recipient_address, kind: 'reply', reply_to_message_id: message.reply_to_message_id }
  const instruction = `Reply using crew_message(recipient=${JSON.stringify(message.sender_address)}, reply_to_message_id=${JSON.stringify(message.message_id)}, text="...").`
  return `${JSON.stringify(header)}\n${instruction}\n<crew-message-body encoding="json">\n${JSON.stringify(message.body)}\n</crew-message-body>`
}
