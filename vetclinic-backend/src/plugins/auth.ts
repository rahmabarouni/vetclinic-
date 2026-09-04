import fp from "fastify-plugin";
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import jwt from "@fastify/jwt";
import { UserRole } from "@prisma/client";
import { getJwtSecret } from "../validate-env";

export interface JwtPayload {
  userId: string;
  role: UserRole;
}

export default fp(async (fastify: FastifyInstance) => {
  fastify.register(jwt, {
    secret: getJwtSecret(),
  });

  fastify.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.code(401).send({ error: "Non authentifié." });
    }
  });

  fastify.decorate("authorize", (roles: UserRole[]) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const currentUserRole = request.user?.role;

      if (!currentUserRole || !roles.includes(currentUserRole)) {
        return reply.code(403).send({ error: "Accès refusé." });
      }
    };
  });
});

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authorize: (roles: UserRole[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}