import { FastifyInstance } from "fastify";
import { buildApp } from "../app";

let app: FastifyInstance;

export async function getApp(): Promise<FastifyInstance> {
  if (!app) {
    app = await buildApp();
    await app.ready();
  }
  return app;
}

export async function closeApp(): Promise<void> {
  if (app) {
    await app.close();
    app = undefined as any;
  }
}
