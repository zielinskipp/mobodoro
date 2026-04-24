import Fastify from "fastify";
import websocket from "@fastify/websocket";
import fastifyStatic from "@fastify/static";
import path from "path";
import { fileURLToPath } from "url";
import type { WebSocket } from "ws";
import { createRegistry } from "./registry.js";
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
  skipPhase,
  renameMobber,
} from "./session.js";

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

  // Keepalive pings every 30 seconds to prevent proxy/idle disconnect
  setInterval(() => {
    connections.forEach((sockets) => {
      sockets.forEach((socket) => {
        if (socket.readyState === 1) {
          socket.ping();
        }
      });
    });
  }, 30_000);

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
    fastify.log.info({ sessionId: session.id }, "session created");

    return {
      sessionId: session.id,
      url: `/room/${session.id}`,
    };
  });

  // GET /room/:id - Serve room HTML page
  fastify.get("/room/:id", async (request, reply) => {
    return reply.sendFile("room.html");
  });

  fastify.register(async (fastify) => {
    await fastify.register(websocket);

    fastify.get("/ws/:id", { websocket: true }, (socket, request) => {
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
      fastify.log.info({ sessionId: id, clients: connections.get(id)!.size }, "client connected");

      // Send initial state
      socket.send(JSON.stringify(session));

      // Handle client disconnect
      socket.on("close", () => {
        const sockets = connections.get(id);
        if (sockets) {
          sockets.delete(socket);
          const remaining = sockets.size;
          fastify.log.info({ sessionId: id, clients: remaining }, "client disconnected");
          if (remaining === 0) {
            connections.delete(id);
          }
        }
      });

      socket.on("message", (raw: Buffer) => {
        const message = JSON.parse(raw.toString());

        if (message.command === "start") {
          let current = registry.get(id);
          if (current) {
            current = startTimer(current);
            registry.set(id, current);
            fastify.log.info({ sessionId: id, phase: current.phase }, "timer started");
            broadcast(id);
          }
        }
        if (message.command === "pause") {
          let current = registry.get(id);
          if (current) {
            current = pauseTimer(current);
            registry.set(id, current);
            fastify.log.info({ sessionId: id }, "timer paused");
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
              longBreakMinutes: message.longBreakMinutes,
              shortBreaksBeforeLongBreak: message.shortBreaksBeforeLongBreak,
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
            fastify.log.info({ sessionId: id, name: message.name }, "mobber added");
            broadcast(id);
          }
        }
        if (message.command === "removeMobber") {
          let current = registry.get(id);
          if (current) {
            current = removeMobber(current, message.name);
            registry.set(id, current);
            fastify.log.info({ sessionId: id, name: message.name }, "mobber removed");
            broadcast(id);
          }
        }
        if (message.command === "rotateMobber") {
          let current = registry.get(id);
          if (current) {
            current = rotateMobber(current);
            registry.set(id, current);
            fastify.log.info({ sessionId: id, driver: current.mobbers[0] }, "mob rotated");
            broadcast(id);
          }
        }
        if (message.command === "renameMobber") {
          let current = registry.get(id);
          if (current) {
            current = renameMobber(current, message.oldName, message.newName);
            registry.set(id, current);
            fastify.log.info({ sessionId: id, oldName: message.oldName, newName: message.newName }, "mobber renamed");
            broadcast(id);
          }
        }
        if (message.command === "skip") {
          let current = registry.get(id);
          if (current) {
            const prevPhase = current.phase;
            current = skipPhase(current);
            registry.set(id, current);
            fastify.log.info({ sessionId: id, from: prevPhase, to: current.phase }, "phase skipped");
            broadcast(id);
          }
        }
      });
    });
  });
  return fastify;
}
