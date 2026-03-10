import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createServer } from "../src/server";
import type { FastifyInstance } from "fastify";
import WebSocket from "ws";

describe("Server integration", () => {
  let server: FastifyInstance;
  let baseUrl: string;
  let wsUrl: string;

  beforeEach(async () => {
    server = createServer();
    await server.listen({ port: 0 });
    const address = server.server.address();
    if (!address || typeof address === "string") {
      throw new Error("Could not get server address");
    }
    baseUrl = `http://localhost:${address.port}`;
    wsUrl = `ws://localhost:${address.port}`;
  });

  afterEach(async () => {
    await server.close();
  });

  it("should create a new session via POST /sessions", async () => {
    const response = await fetch(`${baseUrl}/sessions`, {
      method: "POST",
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("sessionId");
    expect(data).toHaveProperty("url");
  });

  it("should accept WebSocket connection", async () => {
    const response = await fetch(`${baseUrl}/sessions`, { method: "POST" });
    const { sessionId } = await response.json();

    const ws = new WebSocket(`${wsUrl}/session/${sessionId}`);

    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
      setTimeout(() => reject(new Error("timeout")), 1000);
    });

    ws.close();
  });

  it("should send initial session state on connection", async () => {
    const response = await fetch(`${baseUrl}/sessions`, { method: "POST" });
    const { sessionId } = await response.json();

    const ws = new WebSocket(`${wsUrl}/session/${sessionId}`);

    const message = await new Promise<any>((resolve, reject) => {
      ws.once("message", (data) => resolve(JSON.parse(data.toString())));
      ws.once("error", reject);
      setTimeout(() => reject(new Error("timeout")), 1000);
    });

    expect(message.id).toBe(sessionId);
    expect(message.phase).toBe("work");
    expect(message.timer.minutes).toBe(25);

    ws.close();
  });

  it("should handle start command", async () => {
    const response = await fetch(`${baseUrl}/sessions`, { method: "POST" });
    const { sessionId } = await response.json();

    const ws = new WebSocket(`${wsUrl}/session/${sessionId}`);

    // Wait for initial message
    await new Promise<void>((resolve) => {
      ws.once("message", () => resolve());
    });

    // Send start command
    ws.send(JSON.stringify({ command: "start" }));

    // Should receive updated state with timer running
    const updated = await new Promise<any>((resolve, reject) => {
      ws.once("message", (data) => resolve(JSON.parse(data.toString())));
      setTimeout(() => reject(new Error("timeout")), 1000);
    });

    expect(updated.timer.isRunning).toBe(true);

    ws.close();
  });
});
