import { Context, Service } from "@deepseek-ai/cordis";
import { SessionEvent } from "@deepseek-ai/dsh-session";

//#region src/addressing.d.ts
/** Model-safe directory row. It deliberately excludes DSH and fabric internals. */
interface DirectoryEntry {
  readonly address: string;
  readonly status: 'routable' | 'ambiguous' | 'conflict';
  readonly source: 'configured' | 'session-title';
}
//#endregion
//#region src/service.d.ts
interface BindingConfig {
  address: string;
  sessionId: string;
}
/** Dashboard-safe adapter state; it contains neither a lease token nor a DSH identity. */
interface CrewMessagingStatus {
  readonly initialized: boolean;
  readonly stopped: boolean;
  readonly connected: boolean;
  readonly leaseExpiresAt?: string;
}
interface CrewMessagingConfig {
  url?: string;
  adapterId?: string;
  instanceId?: string;
  bindings?: BindingConfig[];
  workbenchAddress?: string;
  codexControlUrl?: string;
  reviewUrl?: string;
  leaseDuration?: string;
  renewMs?: number;
  pollMs?: number;
  claimDuration?: string;
  ttl?: string;
  acceptanceTimeoutMs?: number;
  acceptancePollMs?: number;
  reviewerProfilePath?: string;
  reviewerPreset?: string;
  reviewerProvider?: string;
  reviewerModel?: string;
  reviewerEffort?: string;
  reviewerCapacity?: number;
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
declare module '@deepseek-ai/cordis' {
  interface Context {
    crewMessaging: CrewMessagingProvider;
  }
}
/** Cordis provider plus consumer: it owns only its adapter lease and created cold-root handles. */
declare class CrewMessagingProvider extends Service {
  static inject: string[];
  private readonly runtime;
  private readonly service;
  private readonly reviewerRuntime;
  constructor(ctx: Context, config?: CrewMessagingConfig);
  /** Model-safe directory projection for other same-process plugin consumers. */
  directory(): readonly DirectoryEntry[];
  /** Model-safe local adapter state for other same-process plugin consumers. */
  status(): CrewMessagingStatus;
  /** Refresh subscription emitted after the directory map is coherent. */
  onDirectoryChanged(listener: () => void): () => void;
  /** Submit a browser workbench prompt through this provider's held fabric lease. */
  sendWorkbench(sessionId: string, operationId: string, text: string): Promise<{
    messageId: string;
    replayed: boolean;
  }>;
}
/** Fold only durable explicit renames; automatic names never become fabric addresses. */
declare function explicitUserTitle(events: readonly SessionEvent[]): string | undefined;
/** Fold durable inbox splices in their independent next-turn and next-step coordinate spaces. */
declare function acceptedMessages(events: readonly SessionEvent[]): NativeMessage[];
declare function apply(ctx: Context, config?: CrewMessagingConfig): void;
//#endregion
export { CrewMessagingProvider, type CrewMessagingStatus, type DirectoryEntry, acceptedMessages, apply, apply as default, explicitUserTitle };