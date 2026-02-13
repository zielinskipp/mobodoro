import type { SessionState } from "./session";

export function createRegistry() {
  const sessions = new Map<string, SessionState>();

  return {
    set: (id: string, session: SessionState): void => {
      sessions.set(id, session);
    },

    get: (id: string): SessionState | undefined => {
      return sessions.get(id);
    },

    delete: (id: string): boolean => {
      return sessions.delete(id);
    },

    has: (id: string): boolean => {
      return sessions.has(id);
    },
  };
}
