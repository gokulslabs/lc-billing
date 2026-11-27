let pending: { payload: string; id: string } | null = null;

export function operationId(payload: string): string {
  if (pending?.payload === payload) return pending.id;
  pending = { payload, id: crypto.randomUUID() };
  return pending.id;
}

export function completeOperation(payload: string): void {
  if (pending?.payload === payload) pending = null;
}
