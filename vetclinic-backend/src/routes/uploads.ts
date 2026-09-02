import { FastifyInstance } from "fastify";
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from "../plugins/minio";

export default async function uploadsRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", fastify.authenticate);

  fastify.post("/uploads", async (request, reply) => {
    const data = await request.file();

    if (!data) {
      return reply.code(400).send({ error: "Aucun fichier fourni." });
    }

    if (!ALLOWED_MIME_TYPES.includes(data.mimetype)) {
      return reply.code(415).send({
        error: "Type de fichier non supporté.",
        allowed: ALLOWED_MIME_TYPES,
      });
    }

    const chunks: Buffer[] = [];
    let totalSize = 0;

    for await (const chunk of data.file) {
      totalSize += chunk.length;
      if (totalSize > MAX_FILE_SIZE) {
        return reply.code(413).send({
          error: `Fichier trop volumineux. Taille maximale : ${MAX_FILE_SIZE / 1024 / 1024} Mo.`,
        });
      }
      chunks.push(chunk);
    }

    const buffer = Buffer.concat(chunks);

    if (buffer.length === 0) {
      return reply.code(400).send({ error: "Fichier vide." });
    }

    const ext = data.filename.split(".").pop() || "bin";
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const key = `uploads/${timestamp}-${random}.${ext}`;

    const { url } = await fastify.minio.uploadFile(key, buffer, data.mimetype);

    return reply.code(201).send({
      upload: {
        key,
        url,
        filename: data.filename,
        contentType: data.mimetype,
        size: buffer.length,
      },
    });
  });
}
