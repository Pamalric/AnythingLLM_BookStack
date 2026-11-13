/** Clé logique stable d'une page BookStack (CDC §5). */
export function buildSourceKey(instanceId: string, pageId: number | string): string {
  const normalizedInstance = normalizeInstanceId(instanceId);
  return `bookstack:${normalizedInstance}:page:${pageId}`;
}

export function normalizeInstanceId(instanceId: string): string {
  return instanceId
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
}

export function parseSourceKey(sourceKey: string): { instanceId: string; pageId: string } | null {
  const match = /^bookstack:([^:]+):page:(\d+)$/.exec(sourceKey);
  if (!match) {
    return null;
  }
  return { instanceId: match[1]!, pageId: match[2]! };
}
