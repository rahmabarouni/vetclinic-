import { FastifyInstance } from "fastify";
import { z } from "zod";
import { getPaginationParams, paginatedResponse, searchFilter } from "../utils/pagination";

const createConversationSchema = z.object({
  veterinarianId: z.string().uuid(),
});

const createMessageSchema = z
  .object({
    content: z.string().min(1).nullable().optional(),
    attachmentUrl: z.string().url().nullable().optional(),
    attachmentType: z.enum(["IMAGE", "DOCUMENT"]).nullable().optional(),
  })
  .refine((data) => Boolean(data.content?.trim()) || Boolean(data.attachmentUrl), {
    message: "Un message texte ou une pièce jointe est requis.",
    path: ["content"],
  })
  .refine((data) => !data.attachmentUrl || Boolean(data.attachmentType), {
    message: "attachmentType est requis quand attachmentUrl est fourni.",
    path: ["attachmentType"],
  });

const conversationSelect = {
  id: true,
  clientId: true,
  veterinarianId: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  client: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
    },
  },
  veterinarian: {
    select: {
      id: true,
      userId: true,
      specialty: true,
      bio: true,
      isAvailableForBooking: true,
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
        },
      },
    },
  },
} as const;

const messageSelect = {
  id: true,
  conversationId: true,
  senderId: true,
  content: true,
  attachmentUrl: true,
  attachmentType: true,
  isRead: true,
  createdAt: true,
  updatedAt: true,
  sender: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
    },
  },
} as const;

async function loadConversationOrReject(fastify: FastifyInstance, conversationId: string, userId: string, role: string): Promise<any> {
  const conversation = await fastify.prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      clientId: true,
      veterinarianId: true,
      status: true,
      client: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
        },
      },
      veterinarian: {
        select: {
          id: true,
          userId: true,
          specialty: true,
          bio: true,
          isAvailableForBooking: true,
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              role: true,
            },
          },
        },
      },
    },
  });

  if (!conversation) {
    return null;
  }

  if (role === "CLIENT") {
    if (conversation.clientId !== userId) {
      return false;
    }
    return conversation;
  }

  if (role === "VETERINARIAN") {
    if (!conversation.veterinarian || conversation.veterinarian.userId !== userId) {
      return false;
    }
    return conversation;
  }

  return conversation;
}

export default async function conversationsRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", fastify.authenticate);

  fastify.post(
    "/conversations",
    {
      preHandler: [fastify.authorize(["CLIENT"])],
      schema: {
        body: {
          type: "object",
          required: ["veterinarianId"],
          properties: {
            veterinarianId: { type: "string", format: "uuid" },
          },
        },
      },
    },
    async (request, reply) => {
      const parsed = createConversationSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Données invalides", details: parsed.error.flatten() });
      }

      const { userId } = request.user;
      const veterinarianId = parsed.data.veterinarianId ?? null;

      if (veterinarianId) {
        const veterinarian = await fastify.prisma.veterinarian.findUnique({
          where: { id: veterinarianId },
          select: { id: true },
        });

        if (!veterinarian) {
          return reply.code(404).send({ error: "Vétérinaire introuvable." });
        }
      }

      const existingConversation = await fastify.prisma.conversation.findFirst({
        where: {
          clientId: userId,
          veterinarianId,
          status: "OPEN",
        },
        select: conversationSelect,
      });

      if (existingConversation) {
        return reply.send({ conversation: existingConversation });
      }

      const conversation = await fastify.prisma.conversation.create({
        data: {
          clientId: userId,
          veterinarianId,
        },
        select: conversationSelect,
      });

      return reply.code(201).send({ conversation });
    }
  );

  fastify.get("/conversations", async (request, reply) => {
    const { userId, role } = request.user;
    const query = request.query as { page?: string; limit?: string };
    const { page, limit, skip } = getPaginationParams(query);

    if (role === "CLIENT") {
      const where = { clientId: userId };
      const [conversations, total] = await Promise.all([
        fastify.prisma.conversation.findMany({ where, skip, take: limit, orderBy: { updatedAt: "desc" }, select: conversationSelect }),
        fastify.prisma.conversation.count({ where }),
      ]);
      return reply.send(paginatedResponse(conversations, total, page, limit));
    }

    if (role === "VETERINARIAN") {
      const veterinarian = await fastify.prisma.veterinarian.findUnique({ where: { userId }, select: { id: true } });
      if (!veterinarian) {
        return reply.code(404).send({ error: "Profil vétérinaire introuvable." });
      }
      const where = { veterinarianId: veterinarian.id };
      const [conversations, total] = await Promise.all([
        fastify.prisma.conversation.findMany({ where, skip, take: limit, orderBy: { updatedAt: "desc" }, select: conversationSelect }),
        fastify.prisma.conversation.count({ where }),
      ]);
      return reply.send(paginatedResponse(conversations, total, page, limit));
    }

    const where = {};
    const [conversations, total] = await Promise.all([
      fastify.prisma.conversation.findMany({ where, skip, take: limit, orderBy: { updatedAt: "desc" }, select: conversationSelect }),
      fastify.prisma.conversation.count({ where }),
    ]);
    return reply.send(paginatedResponse(conversations, total, page, limit));
  });

  fastify.get("/conversations/:id/messages", async (request, reply) => {
    const parsedParams = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!parsedParams.success) {
      return reply.code(400).send({ error: "Données invalides", details: parsedParams.error.flatten() });
    }

    const { userId, role } = request.user;
    const conversation = await loadConversationOrReject(fastify, parsedParams.data.id, userId, role);

    if (!conversation) {
      return reply.code(404).send({ error: "Conversation introuvable." });
    }

    if (conversation === false) {
      return reply.code(403).send({ error: "Accès refusé." });
    }

    const msgQuery = request.query as { page?: string; limit?: string };
    const msgPagination = getPaginationParams(msgQuery);

    const [messages, msgTotal] = await Promise.all([
      fastify.prisma.message.findMany({
        where: { conversationId: conversation.id },
        skip: msgPagination.skip,
        take: msgPagination.limit,
        orderBy: { createdAt: "asc" },
        select: messageSelect,
      }),
      fastify.prisma.message.count({ where: { conversationId: conversation.id } }),
    ]);

    return reply.send({ conversation, ...paginatedResponse(messages, msgTotal, msgPagination.page, msgPagination.limit) });
  });

  fastify.post("/conversations/:id/messages", {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: "object",
        required: ["content"],
        properties: {
          content: { type: "string", minLength: 1 },
          attachmentUrl: { type: "string", format: "uri" },
          attachmentType: { type: "string", enum: ["IMAGE", "DOCUMENT"] },
        },
      },
    },
  }, async (request, reply) => {
    const parsedParams = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!parsedParams.success) {
      return reply.code(400).send({ error: "Données invalides", details: parsedParams.error.flatten() });
    }

    const parsedBody = createMessageSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.code(400).send({ error: "Données invalides", details: parsedBody.error.flatten() });
    }

    const { userId, role } = request.user;
    const conversation = await loadConversationOrReject(fastify, parsedParams.data.id, userId, role);

    if (!conversation) {
      return reply.code(404).send({ error: "Conversation introuvable." });
    }

    if (conversation === false) {
      return reply.code(403).send({ error: "Accès refusé." });
    }

    if (conversation.status === "CLOSED") {
      return reply.code(409).send({ error: "Conversation fermée." });
    }

    const message = await fastify.prisma.$transaction(async (transaction) => {
      const createdMessage = await transaction.message.create({
        data: {
          conversationId: conversation.id,
          senderId: userId,
          content: parsedBody.data.content ?? null,
          attachmentUrl: parsedBody.data.attachmentUrl ?? null,
          attachmentType: parsedBody.data.attachmentType ?? null,
        },
        select: messageSelect,
      });

      await transaction.conversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      });

      return createdMessage;
    });

    const recipientId = role === "CLIENT" ? conversation.veterinarianId : conversation.clientId;
    if (recipientId) {
      const recipientUser =
        role === "CLIENT"
          ? await fastify.prisma.veterinarian.findUnique({
              where: { id: recipientId },
              select: { userId: true },
            })
          : { userId: recipientId };

      if (recipientUser?.userId) {
        const sender = await fastify.prisma.user.findUnique({
          where: { id: userId },
          select: { firstName: true, lastName: true },
        });
        await fastify.prisma.notification.create({
          data: {
            recipientId: recipientUser.userId,
            type: "MESSAGE",
            title: `Nouveau message de ${sender?.firstName} ${sender?.lastName}`,
            message: parsedBody.data.content?.substring(0, 200) || "Pièce jointe",
          },
        });
      }
    }

    return reply.code(201).send({ message });
  });
}
