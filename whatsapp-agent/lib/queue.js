// Per-chat in-process serializer. Prevents two concurrent runs against the
// same conversation from clobbering each other's history/facts. Each task is
// chained behind the previous one keyed by a chat key.

const queues = new Map();

export function withChatLock(key, task) {
  const previous = queues.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(() => task());
  queues.set(
    key,
    next.finally(() => {
      if (queues.get(key) === next) queues.delete(key);
    }),
  );
  return next;
}
