import { describe, it, expect } from "vitest";
import { createRegistry } from "../src/registry";
import { makeSession } from "../src/session";

describe("Session registry", () => {
  it("should store and retrieve a session", () => {
    const registry = createRegistry();
    const session = makeSession();

    registry.set(session.id, session);
    const retrieved = registry.get(session.id);

    expect(retrieved).toEqual(session);
  });

  it("should return undefined for non-existent session", () => {
    const registry = createRegistry();
    const result = registry.get("non-existent-id");
    expect(result).toBeUndefined();
  });

  it("should delete a session", () => {
    const registry = createRegistry();
    const session = makeSession();

    registry.set(session.id, session);
    registry.delete(session.id);
    const result = registry.get(session.id);

    expect(result).toBeUndefined();
  });

  it("should return true for existing session", () => {
    const registry = createRegistry();
    const session = makeSession();

    registry.set(session.id, session);
    expect(registry.has(session.id)).toBe(true);
  });
});
