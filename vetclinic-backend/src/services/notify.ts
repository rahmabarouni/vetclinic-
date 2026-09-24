import { FastifyInstance } from "fastify";
import type { NotificationType } from "@prisma/client";

const FCM_ENDPOINT = "https://fcm.googleapis.com/fcm/send";

interface NotifyInput {
  recipientId: string;
  type: NotificationType;
  title: string;
  body: string;
}

export async function notifyUser(
  fastify: FastifyInstance,
  { recipientId, type, title, body }: NotifyInput,
) {
  await fastify.prisma.notification.create({
    data: { recipientId, type, title, message: body },
  });
  await sendFcmPush(fastify, recipientId, { title, body });
}

export async function sendFcmPush(
  fastify: FastifyInstance,
  recipientId: string,
  { title, body }: { title: string; body: string },
) {
  const serverKey = process.env.FCM_SERVER_KEY;
  if (!serverKey) return;

  try {
    const recipient = await fastify.prisma.user.findUnique({
      where: { id: recipientId },
      select: { fcmToken: true },
    });
    const token = recipient?.fcmToken;
    if (!token) return;

    const res = await fetch(FCM_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `key=${serverKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: token,
        notification: { title, body },
        data: { type: "generic" },
      }),
    });

    if (!res.ok) {
      fastify.log.warn(`FCM push failed: ${res.status} ${await res.text()}`);
    }
  } catch (err) {
    fastify.log.error("FCM push error: %s", String(err));
  }
}