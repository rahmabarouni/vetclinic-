import { FastifyInstance } from "fastify";
import type { NotificationType } from "@prisma/client";
import { cert, getApps, initializeApp } from "firebase-admin";
import { getMessaging } from "firebase-admin/messaging";

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
  await sendFcmPush(fastify, recipientId, { title, body, type });
}

export async function sendFcmPush(
  fastify: FastifyInstance,
  recipientId: string,
  { title, body, type }: { title: string; body: string; type?: string },
) {
  try {
    if (getApps().length === 0) {
      const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
      if (!serviceAccountPath) return;

      try {
        initializeApp({
          credential: cert(serviceAccountPath),
        });
      } catch (initErr) {
        fastify.log.error("Firebase Admin init failed: %s", String(initErr));
        return;
      }
    }

    const recipient = await fastify.prisma.user.findUnique({
      where: { id: recipientId },
      select: { fcmToken: true },
    });
    const token = recipient?.fcmToken;
    if (!token) return;

    await getMessaging().send({
      token,
      notification: { title, body },
      data: { type: type ?? "generic" },
    });
  } catch (err) {
    fastify.log.error("FCM push error: %s", String(err));
  }
}