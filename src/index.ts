import { createServer } from "./server.js";

const server = createServer();

const PORT = parseInt(process.env.PORT ?? "3000", 10);

const start = async () => {
  try {
    await server.listen({ port: PORT, host: "0.0.0.0" });
    console.log(`Server running at http://localhost:${PORT}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
