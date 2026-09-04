import "./validate-env";
import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import multipart from "@fastify/multipart";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import prismaPlugin from "./plugins/prisma";
import authPlugin from "./plugins/auth";
import minioPlugin from "./plugins/minio";
import authRoutes from "./routes/auth";
import petsRoutes from "./routes/pets";
import appointmentsRoutes from "./routes/appointments";
import timeSlotBlockRoutes from "./routes/time-slot-blocks";
import medicalRecordsRoutes from "./routes/medical-records";
import conversationsRoutes from "./routes/conversations";
import documentsRoutes from "./routes/documents";
import notificationsRoutes from "./routes/notifications";
import veterinariansRoutes from "./routes/veterinarians";
import wsConversationsRoutes from "./routes/ws-conversations";
import uploadsRoutes from "./routes/uploads";
import dashboardRoutes from "./routes/dashboard";
import passwordResetRoutes from "./routes/password-reset";
import downloadsRoutes from "./routes/downloads";
import activityRoutes from "./routes/activity";
import usersRoutes from "./routes/users";
import searchRoutes from "./routes/search";

export async function buildApp() {
  const fastify = Fastify({ logger: false });

  await fastify.register(cors, { origin: true });
  await fastify.register(websocket);
  await fastify.register(swagger, {
    openapi: {
      info: {
        title: "Vet Clinic API",
        description: "API backend pour la clinique veterinaire",
        version: "1.0.0",
      },
      servers: [{ url: "http://localhost:3000" }],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      },
    },
  });
  await fastify.register(swaggerUi, { routePrefix: "/docs" });
  await fastify.register(prismaPlugin);
  await fastify.register(authPlugin);
  await fastify.register(minioPlugin);
  await fastify.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
  await fastify.register(rateLimit, { max: 100, timeWindow: "1 minute" });
  await fastify.register(authRoutes, { prefix: "/api/v1" });
  await fastify.register(petsRoutes, { prefix: "/api/v1" });
  await fastify.register(appointmentsRoutes, { prefix: "/api/v1" });
  await fastify.register(timeSlotBlockRoutes, { prefix: "/api/v1" });
  await fastify.register(medicalRecordsRoutes, { prefix: "/api/v1" });
  await fastify.register(conversationsRoutes, { prefix: "/api/v1" });
  await fastify.register(documentsRoutes, { prefix: "/api/v1" });
  await fastify.register(notificationsRoutes, { prefix: "/api/v1" });
  await fastify.register(veterinariansRoutes, { prefix: "/api/v1" });
  await fastify.register(wsConversationsRoutes, { prefix: "/api/v1" });
  await fastify.register(uploadsRoutes, { prefix: "/api/v1" });
  await fastify.register(dashboardRoutes, { prefix: "/api/v1" });
  await fastify.register(passwordResetRoutes, { prefix: "/api/v1" });
  await fastify.register(downloadsRoutes, { prefix: "/api/v1" });
  await fastify.register(activityRoutes, { prefix: "/api/v1" });
  await fastify.register(usersRoutes, { prefix: "/api/v1" });
  await fastify.register(searchRoutes, { prefix: "/api/v1" });

  fastify.get("/health", async (_request, reply) => {
    const checks: Record<string, { status: string; latencyMs?: number }> = {};

    const dbStart = Date.now();
    try {
      await fastify.prisma.$queryRaw`SELECT 1`;
      checks.database = { status: "ok", latencyMs: Date.now() - dbStart };
    } catch {
      checks.database = { status: "error", latencyMs: Date.now() - dbStart };
    }

    const minioStart = Date.now();
    try {
      const { HeadBucketCommand } = await import("@aws-sdk/client-s3");
      await fastify.minio.s3.send(new HeadBucketCommand({ Bucket: fastify.minio.bucket }));
      checks.minio = { status: "ok", latencyMs: Date.now() - minioStart };
    } catch {
      checks.minio = { status: "error", latencyMs: Date.now() - minioStart };
    }

    const mem = process.memoryUsage();
    const allOk = Object.values(checks).every((c) => c.status === "ok");

    return reply.code(allOk ? 200 : 503).send({
      status: allOk ? "ok" : "degraded",
      uptime: Math.floor(process.uptime()),
      memory: {
        rss: `${(mem.rss / 1024 / 1024).toFixed(1)} MB`,
        heapUsed: `${(mem.heapUsed / 1024 / 1024).toFixed(1)} MB`,
        heapTotal: `${(mem.heapTotal / 1024 / 1024).toFixed(1)} MB`,
        external: `${(mem.external / 1024 / 1024).toFixed(1)} MB`,
      },
      checks,
    });
  });

  return fastify;
}
