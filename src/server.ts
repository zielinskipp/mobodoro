import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { createRegistry } from "./registry";
import { makeSession, startTimer } from "./session";

export function createServer() {
  const fastify = Fastify({
    logger: true,
  });

  const registry = createRegistry();

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

      if (session) {
        socket.send(JSON.stringify(session));
      }

      socket.on("message", (raw) => {
        const message = JSON.parse(raw.toString());

        if (message.command === "start") {
          let current = registry.get(id);
          if (current) {
            current = startTimer(current);
            registry.set(id, current);
            socket.send(JSON.stringify(current));
          }
        }
      });
    });
  });
  return fastify;
}
