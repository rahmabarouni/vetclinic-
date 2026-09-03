import { FastifyInstance } from "fastify";
import { z } from "zod";

const updateProfileSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
});

const profileSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  address: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

export default async function usersRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", fastify.authenticate);

  fastify.get("/users/profile", async (request, reply) => {
    const { userId } = request.user;

    const user = await fastify.prisma.user.findUnique({
      where: { id: userId },
      select: profileSelect,
    });

    if (!user) {
      return reply.code(404).send({ error: "Utilisateur introuvable." });
    }

    return reply.send({ user });
  });

  fastify.put("/users/profile", async (request, reply) => {
    const parsed = updateProfileSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Données invalides", details: parsed.error.flatten() });
    }

    const { userId } = request.user;
    const data = parsed.data;

    if (Object.keys(data).length === 0) {
      return reply.code(400).send({ error: "Aucun champ à modifier." });
    }

    const user = await fastify.prisma.user.update({
      where: { id: userId },
      data,
      select: profileSelect,
    });

    return reply.send({ user });
  });

  fastify.post("/users/profile/photo", async (request, reply) => {
    const data = await request.file();
    if (!data) {
      return reply.code(400).send({ error: "Aucun fichier fourni." });
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(data.mimetype)) {
      return reply.code(415).send({ error: "Type non supporté. Utilisez JPEG, PNG ou WebP." });
    }

    const chunks: Buffer[] = [];
    let totalSize = 0;
    const maxSize = 5 * 1024 * 1024;

    for await (const chunk of data.file) {
      totalSize += chunk.length;
      if (totalSize > maxSize) {
        return reply.code(413).send({ error: "Fichier trop volumineux (max 5 Mo)." });
      }
      chunks.push(chunk);
    }

    const buffer = Buffer.concat(chunks);
    const ext = data.filename.split(".").pop() || "jpg";
    const key = `profiles/${request.user.userId}-${Date.now()}.${ext}`;

    const { url } = await fastify.minio.uploadFile(key, buffer, data.mimetype);

    await fastify.prisma.user.update({
      where: { id: request.user.userId },
      data: { photoUrl: url },
    });

    return reply.code(201).send({ photo: { key, url } });
  });
}
