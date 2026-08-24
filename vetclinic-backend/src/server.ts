import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import prismaPlugin from "./plugins/prisma";
import authPlugin from "./plugins/auth";
import authRoutes from "./routes/auth";

async function start() {
  const fastify = Fastify({ logger: true });

  await fastify.register(cors, { origin: true });
  await fastify.register(prismaPlugin);
  await fastify.register(authPlugin);
  await fastify.register(authRoutes, { prefix: "/api/v1" });

  fastify.get("/health", async () => ({ status: "ok" }));

  await fastify.listen({ port: 3000, host: "0.0.0.0" });
  console.log("🐾 Serveur démarré sur http://localhost:3000");
}

start();