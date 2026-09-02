import { FastifyInstance } from "fastify";
import { z } from "zod";
import { WebSocket } from "ws";

const wsMessageSchema = z
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
    message: "attachmentType requis quand attachmentUrl est fourni.",
    path: ["attachmentType"],
  });

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

interface ConnectedClient {
  ws: WebSocket;
  userId: string;
  role: string;
}

const clientsByConversation = new Map<string, ConnectedClient[]>();

async function loadConversationOrReject(
  fastify: FastifyInstance,
  conversationId: string,
  userId: string,
  role: string,
): Promise<any> {
  const conversation = await fastify.prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      clientId: true,
      veterinarianId: true,
      status: true,
    },
  });

  if (!conversation) return null;

  if (role === "CLIENT") {
    return conversation.clientId === userId ? conversation : false;
  }

  if (role === "VETERINARIAN") {
    const vet = await fastify.prisma.veterinarian.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!vet || conversation.veterinarianId !== vet.id) return false;
    return conversation;
  }

  return conversation;
}

function broadcastToConversation(conversationId: string, data: object, excludeWs?: WebSocket) {
  const clients = clientsByConversation.get(conversationId) || [];
  const payload = JSON.stringify(data);
  for (const client of clients) {
    if (client.ws !== excludeWs && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(payload);
    }
  }
}

function addClient(conversationId: string, client: ConnectedClient) {
  const existing = clientsByConversation.get(conversationId) || [];
  existing.push(client);
  clientsByConversation.set(conversationId, existing);
}

function removeClient(conversationId: string, ws: WebSocket) {
  const clients = clientsByConversation.get(conversationId) || [];
  const filtered = clients.filter((c) => c.ws !== ws);
  if (filtered.length === 0) {
    clientsByConversation.delete(conversationId);
  } else {
    clientsByConversation.set(conversationId, filtered);
  }
}

export default async function wsConversationsRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/ws/conversations/:conversationId",
    { websocket: true },
    async (socket, request) => {
      const { conversationId } = request.params as { conversationId: string };
      const token = (request.query as { token?: string }).token;

      if (!token) {
        socket.close(4001, "Token manquant");
        return;
      }

      let userId: string;
      let role: string;

      try {
        const decoded = fastify.jwt.verify<{ userId: string; role: string }>(token);
        userId = decoded.userId;
        role = decoded.role;
      } catch {
        socket.close(4001, "Token invalide");
        return;
      }

      const conversation = await loadConversationOrReject(fastify, conversationId, userId, role);

      if (!conversation) {
        socket.close(4004, "Conversation introuvable");
        return;
      }

      if (conversation === false) {
        socket.close(4003, "Accès refusé");
        return;
      }

      const client: ConnectedClient = { ws: socket, userId, role };
      addClient(conversationId, client);

      fastify.log.info(`[WS] Client ${userId} connecté à la conversation ${conversationId}`);

      socket.on("message", async (raw: Buffer) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw.toString());
        } catch {
          socket.send(JSON.stringify({ type: "error", error: "JSON invalide" }));
          return;
        }

        const validation = wsMessageSchema.safeParse(parsed);
        if (!validation.success) {
          socket.send(
            JSON.stringify({ type: "error", error: "Données invalides", details: validation.error.flatten() }),
          );
          return;
        }

        const conversationCheck = await loadConversationOrReject(fastify, conversationId, userId, role);
        if (!conversationCheck || conversationCheck === false) {
          socket.send(JSON.stringify({ type: "error", error: "Accès refusé" }));
          return;
        }

        if (conversationCheck.status === "CLOSED") {
          socket.send(JSON.stringify({ type: "error", error: "Conversation fermée" }));
          return;
        }

        try {
          const result = await fastify.prisma.$transaction(async (tx) => {
            const createdMessage = await tx.message.create({
              data: {
                conversationId,
                senderId: userId,
                content: validation.data.content ?? null,
                attachmentUrl: validation.data.attachmentUrl ?? null,
                attachmentType: validation.data.attachmentType ?? null,
              },
              select: messageSelect,
            });

            await tx.conversation.update({
              where: { id: conversationId },
              data: { updatedAt: new Date() },
            });

            return createdMessage;
          });

          const sender = await fastify.prisma.user.findUnique({
            where: { id: userId },
            select: { firstName: true, lastName: true },
          });

          const recipientId =
            role === "CLIENT" ? conversation.veterinarianId : conversation.clientId;

          if (recipientId) {
            const recipientUser =
              role === "CLIENT"
                ? await fastify.prisma.veterinarian.findUnique({
                    where: { id: recipientId },
                    select: { userId: true },
                  })
                : { userId: recipientId };

            if (recipientUser?.userId) {
              await fastify.prisma.notification.create({
                data: {
                  recipientId: recipientUser.userId,
                  type: "MESSAGE",
                  title: `Nouveau message de ${sender?.firstName} ${sender?.lastName}`,
                  message: validation.data.content?.substring(0, 200) || "Pièce jointe",
                },
              });
            }
          }

          const broadcastPayload = {
            type: "new_message",
            message: result,
          };

          broadcastToConversation(conversationId, broadcastPayload);
        } catch (err: unknown) {
          fastify.log.error("[WS] Erreur sauvegarde message: %s", String(err));
          socket.send(JSON.stringify({ type: "error", error: "Erreur serveur" }));
        }
      });

      socket.on("close", () => {
        removeClient(conversationId, socket);
        fastify.log.info(`[WS] Client ${userId} déconnecté de la conversation ${conversationId}`);
      });

      socket.on("error", (err: Error) => {
        fastify.log.error(`[WS] Erreur socket pour ${userId}: %s`, err.message);
        removeClient(conversationId, socket);
      });
    },
  );
}
