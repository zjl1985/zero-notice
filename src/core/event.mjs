export const AgentEventType = Object.freeze({
  Completed: "completed",
  ApprovalRequired: "approval_required",
});

/**
 * Harness-neutral input accepted by the notification core.
 * Adapters must omit raw conversation, commands, code, and credentials.
 *
 * @typedef {Object} AgentEvent
 * @property {string} id Stable, source-prefixed event identity used for deduplication
 * @property {string} source Harness identifier, such as "codex" or "pi"
 * @property {string} sourceName Safe display name supplied by the adapter
 * @property {string} type One of AgentEventType
 * @property {string|null} sessionId Source session identifier, when available
 * @property {string|null} turnId Source turn identifier, when available
 * @property {string} project Safe display label derived by the adapter
 * @property {string} occurredAt ISO 8601 timestamp
 * @property {string} [toolName] Safe tool label for approval requests
 */
