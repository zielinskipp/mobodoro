import Fastify from "fastify";
import websocket from "@fastify/websocket";
import fastifyStatic from "@fastify/static";
import path from "path";
import { fileURLToPath } from "url";
import type { WebSocket } from "ws";
import { createRegistry } from "./registry";
import {
  makeSession,
  startTimer,
  pauseTimer,
  resetTimer,
  setTimer,
  addMobber,
  removeMobber,
  rotateMobber,
  tick,
  handleTimerExpired,
  configureSession,
} from "./session";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createServer() {
  const fastify = Fastify({
    logger: true,
  });

  const registry = createRegistry();

  // Track WebSocket connections per session
  const connections = new Map<string, Set<WebSocket>>();

  // Broadcast state to all clients in a session
  function broadcast(sessionId: string) {
    const session = registry.get(sessionId);
    const sockets = connections.get(sessionId);
    if (session && sockets) {
      const message = JSON.stringify(session);
      sockets.forEach((socket) => {
        if (socket.readyState === 1) {
          // 1 = WebSocket.OPEN
          socket.send(message);
        }
      });
    }
  }

  // Tick loop - runs every second
  setInterval(() => {
    connections.forEach((_, sessionId) => {
      let session = registry.get(sessionId);
      if (session && session.timer.isRunning) {
        session = tick(session);

        // Check if timer expired (hit 0:0)
        if (session.timer.minutes === 0 && session.timer.seconds === 0) {
          session = handleTimerExpired(session);
        }

        registry.set(sessionId, session);
        broadcast(sessionId);
      }
    });
  }, 1000);

  // Serve static files from public directory
  fastify.register(fastifyStatic, {
    root: path.join(__dirname, "..", "public"),
    prefix: "/",
  });

  // POST /sessions - Create new session
  fastify.post("/sessions", async (request, reply) => {
    const session = makeSession();
    registry.set(session.id, session);

    return {
      sessionId: session.id,
      url: `/session/${session.id}`,
    };
  });

  fastify.register(async (fastify) => {
    await fastify.register(websocket);

    fastify.get("/session/:id", { websocket: true }, (socket, request) => {
      const { id } = request.params as { id: string };
      const session = registry.get(id);

      if (!session) {
        socket.close();
        return;
      }

      // Track this connection
      if (!connections.has(id)) {
        connections.set(id, new Set());
      }
      connections.get(id)!.add(socket);

      // Send initial state
      socket.send(JSON.stringify(session));

      // Handle client disconnect
      socket.on("close", () => {
        const sockets = connections.get(id);
        if (sockets) {
          sockets.delete(socket);
          if (sockets.size === 0) {
            connections.delete(id);
          }
        }
      });

      socket.on("message", (raw) => {
        const message = JSON.parse(raw.toString());

        if (message.command === "start") {
          let current = registry.get(id);
          if (current) {
            current = startTimer(current);
            registry.set(id, current);
            broadcast(id);
          }
        }
        if (message.command === "pause") {
          let current = registry.get(id);
          if (current) {
            current = pauseTimer(current);
            registry.set(id, current);
            broadcast(id);
          }
        }
        if (message.command === "reset") {
          let current = registry.get(id);
          if (current) {
            current = resetTimer(current);
            registry.set(id, current);
            broadcast(id);
          }
        }
        if (message.command === "configure") {
          let current = registry.get(id);
          if (current) {
            current = configureSession(current, {
              workMinutes: message.workMinutes,
              breakMinutes: message.breakMinutes,
              rotationsBeforeBreak: message.rotationsBeforeBreak,
            });
            registry.set(id, current);
            broadcast(id);
          }
        }
        if (message.command === "setTimer") {
          let current = registry.get(id);
          if (current) {
            current = setTimer(current, message.minutes, message.seconds);
            registry.set(id, current);
            broadcast(id);
          }
        }
        if (message.command === "addMobber") {
          let current = registry.get(id);
          if (current) {
            current = addMobber(current, message.name);
            registry.set(id, current);
            broadcast(id);
          }
        }
        if (message.command === "removeMobber") {
          let current = registry.get(id);
          if (current) {
            current = removeMobber(current, message.name);
            registry.set(id, current);
            broadcast(id);
          }
        }
        if (message.command === "rotateMobber") {
          let current = registry.get(id);
          if (current) {
            current = rotateMobber(current);
            registry.set(id, current);
            broadcast(id);
          }
        }
      });
    });
  });
  return fastify;
}
