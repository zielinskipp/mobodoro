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

    const ws = new WebSocket(`${wsUrl}/ws/${sessionId}`);

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

    const ws = new WebSocket(`${wsUrl}/ws/${sessionId}`);

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

    const ws = new WebSocket(`${wsUrl}/ws/${sessionId}`);

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

  it("should handle pause command", async () => {
    const response = await fetch(`${baseUrl}/sessions`, { method: "POST" });
    const { sessionId } = await response.json();

    const ws = new WebSocket(`${wsUrl}/ws/${sessionId}`);

    // Wait for initial message
    await new Promise<void>((resolve) => {
      ws.once("message", () => resolve());
    });

    // Send pause command
    ws.send(JSON.stringify({ command: "pause" }));

    // Should receive updated state with timer paused
    const updated = await new Promise<any>((resolve, reject) => {
      ws.once("message", (data) => resolve(JSON.parse(data.toString())));
      setTimeout(() => reject(new Error("timeout")), 1000);
    });

    expect(updated.timer.isRunning).toBe(false);

    ws.close();
  });

  it("should handle reset command", async () => {
    const response = await fetch(`${baseUrl}/sessions`, { method: "POST" });
    const { sessionId } = await response.json();

    const ws = new WebSocket(`${wsUrl}/ws/${sessionId}`);

    // Wait for initial message
    await new Promise<void>((resolve) => {
      ws.once("message", () => resolve());
    });

    // Start the timer
    ws.send(JSON.stringify({ command: "start" }));

    // Wait for start confirmation
    const started = await new Promise<any>((resolve) => {
      ws.once("message", (data) => resolve(JSON.parse(data.toString())));
    });

    expect(started.timer.isRunning).toBe(true);

    // Now send reset command
    ws.send(JSON.stringify({ command: "reset" }));

    // Should receive updated state with timer reset to defaults
    const updated = await new Promise<any>((resolve, reject) => {
      ws.once("message", (data) => resolve(JSON.parse(data.toString())));
      setTimeout(() => reject(new Error("timeout")), 1000);
    });

    expect(updated.timer.minutes).toBe(25);
    expect(updated.timer.seconds).toBe(0);
    expect(updated.timer.isRunning).toBe(false);

    ws.close();
  });

  it("should handle configure command", async () => {
    const response = await fetch(`${baseUrl}/sessions`, { method: "POST" });
    const { sessionId } = await response.json();

    const ws = new WebSocket(`${wsUrl}/ws/${sessionId}`);

    // Wait for initial message
    await new Promise<void>((resolve) => {
      ws.once("message", () => resolve());
    });

    // Send configure command
    ws.send(
      JSON.stringify({
        command: "configure",
        workMinutes: 10,
        breakMinutes: 3,
        rotationsBeforeBreak: 3,
      }),
    );

    // Should receive updated state with new configuration
    const updated = await new Promise<any>((resolve, reject) => {
      ws.once("message", (data) => resolve(JSON.parse(data.toString())));
      setTimeout(() => reject(new Error("timeout")), 1000);
    });

    expect(updated.duration.minutes).toBe(10);
    expect(updated.timer.minutes).toBe(10);
    expect(updated.breakDuration.minutes).toBe(3);
    expect(updated.rotationsBeforeBreak).toBe(3);

    ws.close();
  });

  it("should tick running timer every second and broadcast updates", async () => {
    const response = await fetch(`${baseUrl}/sessions`, { method: "POST" });
    const { sessionId } = await response.json();

    const ws = new WebSocket(`${wsUrl}/ws/${sessionId}`);

    // Wait for initial message
    await new Promise<void>((resolve) => {
      ws.once("message", () => resolve());
    });

    // Start the timer
    ws.send(JSON.stringify({ command: "start" }));

    // Wait for start confirmation
    const started = await new Promise<any>((resolve) => {
      ws.once("message", (data) => resolve(JSON.parse(data.toString())));
    });

    expect(started.timer.isRunning).toBe(true);
    expect(started.timer.minutes).toBe(25);
    expect(started.timer.seconds).toBe(0);

    // Wait for tick update (should happen within ~1 second)
    const ticked = await new Promise<any>((resolve, reject) => {
      ws.once("message", (data) => resolve(JSON.parse(data.toString())));
      setTimeout(() => reject(new Error("No tick received")), 1500);
    });

    // Timer should have decremented
    expect(ticked.timer.minutes).toBe(24);
    expect(ticked.timer.seconds).toBe(59);
    expect(ticked.timer.isRunning).toBe(true);

    ws.close();
  });

  it("should handle timer expiration and transition to break phase", async () => {
    const response = await fetch(`${baseUrl}/sessions`, { method: "POST" });
    const { sessionId } = await response.json();

    const ws = new WebSocket(`${wsUrl}/ws/${sessionId}`);

    // Wait for initial message
    await new Promise<void>((resolve) => {
      ws.once("message", () => resolve());
    });

    // Set timer to 0:1 (one second remaining) using test helper command
    ws.send(
      JSON.stringify({
        command: "setTimer",
        minutes: 0,
        seconds: 1,
      }),
    );

    // Wait for setTimer confirmation
    const timerSet = await new Promise<any>((resolve) => {
      ws.once("message", (data) => resolve(JSON.parse(data.toString())));
    });

    expect(timerSet.timer.minutes).toBe(0);
    expect(timerSet.timer.seconds).toBe(1);

    // Start the timer
    ws.send(JSON.stringify({ command: "start" }));

    // Wait for start confirmation
    await new Promise<void>((resolve) => {
      ws.once("message", () => resolve());
    });

    // Wait for tick that expires the timer (should happen within ~1 second)
    // This should trigger handleTimerExpired and transition to break phase
    const expired = await new Promise<any>((resolve, reject) => {
      ws.once("message", (data) => resolve(JSON.parse(data.toString())));
      setTimeout(() => reject(new Error("No expiration received")), 1500);
    });

    // After expiration with rotationsBeforeBreak=1, should go to short break
    expect(expired.timer.minutes).toBe(5);
    expect(expired.timer.seconds).toBe(0);
    expect(expired.timer.isRunning).toBe(false);
    expect(expired.phase).toBe("shortBreak");
    expect(expired.rotationCount).toBe(0);

    ws.close();
  });

  it("should handle addMobber command", async () => {
    const response = await fetch(`${baseUrl}/sessions`, { method: "POST" });
    const { sessionId } = await response.json();

    const ws = new WebSocket(`${wsUrl}/ws/${sessionId}`);

    // Wait for initial message
    await new Promise<void>((resolve) => {
      ws.once("message", () => resolve());
    });

    // Add a mobber
    ws.send(JSON.stringify({ command: "addMobber", name: "Alice" }));

    // Should receive updated state with Alice in mobbers list
    const updated = await new Promise<any>((resolve, reject) => {
      ws.once("message", (data) => resolve(JSON.parse(data.toString())));
      setTimeout(() => reject(new Error("timeout")), 1000);
    });

    expect(updated.mobbers).toEqual(["Alice"]);

    ws.close();
  });

  it("should handle removeMobber command", async () => {
    const response = await fetch(`${baseUrl}/sessions`, { method: "POST" });
    const { sessionId } = await response.json();

    const ws = new WebSocket(`${wsUrl}/ws/${sessionId}`);

    // Wait for initial message
    await new Promise<void>((resolve) => {
      ws.once("message", () => resolve());
    });

    // Add two mobbers
    ws.send(JSON.stringify({ command: "addMobber", name: "Alice" }));
    await new Promise<void>((resolve) => {
      ws.once("message", () => resolve());
    });

    ws.send(JSON.stringify({ command: "addMobber", name: "Bob" }));
    await new Promise<void>((resolve) => {
      ws.once("message", () => resolve());
    });

    // Remove Alice
    ws.send(JSON.stringify({ command: "removeMobber", name: "Alice" }));

    // Should receive updated state with only Bob
    const updated = await new Promise<any>((resolve, reject) => {
      ws.once("message", (data) => resolve(JSON.parse(data.toString())));
      setTimeout(() => reject(new Error("timeout")), 1000);
    });

    expect(updated.mobbers).toEqual(["Bob"]);

    ws.close();
  });

  it("should handle rotateMobber command", async () => {
    const response = await fetch(`${baseUrl}/sessions`, { method: "POST" });
    const { sessionId } = await response.json();

    const ws = new WebSocket(`${wsUrl}/ws/${sessionId}`);

    // Wait for initial message
    await new Promise<void>((resolve) => {
      ws.once("message", () => resolve());
    });

    // Add two mobbers
    ws.send(JSON.stringify({ command: "addMobber", name: "Alice" }));
    await new Promise<void>((resolve) => {
      ws.once("message", () => resolve());
    });

    ws.send(JSON.stringify({ command: "addMobber", name: "Bob" }));
    await new Promise<void>((resolve) => {
      ws.once("message", () => resolve());
    });

    // Rotate mobber
    ws.send(JSON.stringify({ command: "rotateMobber" }));

    // Should receive updated state with currentMobberIndex = 1
    const updated = await new Promise<any>((resolve, reject) => {
      ws.once("message", (data) => resolve(JSON.parse(data.toString())));
      setTimeout(() => reject(new Error("timeout")), 1000);
    });

    expect(updated.currentMobberIndex).toBe(1);

    ws.close();
  });

  it("should handle skip command", async () => {
    const response = await fetch(`${baseUrl}/sessions`, { method: "POST" });
    const { sessionId } = await response.json();

    const ws = new WebSocket(`${wsUrl}/ws/${sessionId}`);

    // Wait for initial message
    await new Promise<void>((resolve) => {
      ws.once("message", () => resolve());
    });

    // Configure for quick testing: 1 rotation before break
    ws.send(
      JSON.stringify({
        command: "configure",
        workMinutes: 10,
        breakMinutes: 3,
        rotationsBeforeBreak: 1,
      }),
    );
    await new Promise<void>((resolve) => {
      ws.once("message", () => resolve());
    });

    // Skip work phase - should go to break
    ws.send(JSON.stringify({ command: "skip" }));

    const updated = await new Promise<any>((resolve, reject) => {
      ws.once("message", (data) => resolve(JSON.parse(data.toString())));
      setTimeout(() => reject(new Error("timeout")), 1000);
    });

    expect(updated.phase).toBe("shortBreak");
    expect(updated.timer.minutes).toBe(3); // break duration

    ws.close();
  });
});
