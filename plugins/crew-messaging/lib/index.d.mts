import { Context, Service } from "@deepseek-ai/cordis";
import { SessionEvent } from "@deepseek-ai/dsh-session";

//#region src/service.d.ts
interface BindingConfig {
  address: string;
  sessionId: string;
}
interface CrewMessagingConfig {
  url?: string;
  adapterId?: string;
  instanceId?: string;
  bindings?: BindingConfig[];
  leaseDuration?: string;
  renewMs?: number;
  pollMs?: number;
  claimDuration?: string;
  ttl?: string;
}
interface NativeMessage {
  readonly id: string;
  readonly source: NativeSource;
  readonly text: string;
}
interface NativeSource {
  kind: 'crew-messaging';
  messageId: string;
  deliveryId: string;
  senderAddress: string;
  recipientAddress: string;
  form: 'relay';
}
//#endregion
//#region src/index.d.ts
declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'crew-messaging': {
      kind: 'crew-messaging';
      messageId: string;
      deliveryId: string;
      senderAddress: string;
      recipientAddress: string;
      form: 'relay';
    };
  }
}
/** Cordis provider plus consumer: it owns only its adapter lease and created cold-root handles. */
declare class CrewMessagingProvider extends Service {
  static inject: string[];
  private readonly runtime;
  private readonly service;
  constructor(ctx: Context, config?: CrewMessagingConfig);
}
/** Fold durable inbox splices in their independent next-turn and next-step coordinate spaces. */
declare function acceptedMessages(events: readonly SessionEvent[]): NativeMessage[];
declare function apply(ctx: Context, config?: CrewMessagingConfig): void;
//#endregion
export { CrewMessagingProvider, acceptedMessages, apply, apply as default };