import fp from "fastify-plugin";
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import jwt from "@fastify/jwt";
import { UserRole } from "@prisma/client";
import { getJwtExpiresIn, getJwtSecret } from "../validate-env";

export interface JwtPayload {
  userId: string;
  role: UserRole;
  tokenVersion: number;
}

export default fp(async (fastify: FastifyInstance) => {
  fastify.register(jwt, {
    secret: getJwtSecret(),
    sign: { expiresIn: getJwtExpiresIn() },
  });

  fastify.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
      const user = await fastify.prisma.user.findUnique({
        where: { id: request.user.userId },
        select: { tokenVersion: true },
      });
      if (!user || user.tokenVersion !== request.user.tokenVersion) {
        return reply.code(401).send({ error: "Non authentifié." });
      }
    } catch (err) {
      return reply.code(401).send({ error: "Non authentifié." });
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