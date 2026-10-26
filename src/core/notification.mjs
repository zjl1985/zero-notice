import { AgentEventType } from "./event.mjs";

export function notificationForEvent(event) {
  if (!event || typeof event.id !== "string" || !event.id) throw new Error("AgentEvent.id is required");
  if (typeof event.source !== "string" || !event.source) throw new Error("AgentEvent.source is required");
  if (typeof event.project !== "string" || !event.project) throw new Error("AgentEvent.project is required");

  const source = event.sourceName || event.source;
  const project = `${source} · ${event.project}`;
  switch (event.type) {
    case AgentEventType.Completed:
      return { title: project, group: project, body: "本轮任务已结束，可以回来查看。" };
    case AgentEventType.ApprovalRequired:
      return {
        title: `${project} · 等待确认`,
        group: project,
        body: `等待 ${event.toolName || "工具"} 操作的权限确认。`,
      };
    default:
      throw new Error(`Unsupported AgentEvent.type: ${String(event.type)}`);
  }
}
