import { notificationForEvent } from "./notification.mjs";

export async function dispatchAgentEvent(event, { store, notifier }) {
  if (!store || !notifier || typeof notifier.send !== "function") {
    throw new Error("dispatchAgentEvent requires a store and a notifier");
  }

  const send = async () => {
    if (await store.has(event.id)) return { duplicate: true };
    await notifier.send(notificationForEvent(event));
    await store.mark(event.id);
    return { sent: true };
  };

  return store.withEventLock ? store.withEventLock(event.id, send) : send();
}
