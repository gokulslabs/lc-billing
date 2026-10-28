const marks = new Map<string, boolean>();
const listeners = new Set<() => void>();

export function markUnsaved(id: string, dirty: boolean) {
  const current = marks.get(id) ?? false;
  if (current === dirty) return;
  if (dirty) marks.set(id, true);
  else marks.delete(id);
  for (const listener of listeners) listener();
}

export function unsavedWork(): boolean {
  return marks.size > 0;
}

export function watchUnsaved(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
