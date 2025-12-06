import type { FastifyInstance } from "fastify";
import type { Socket } from "socket.io";
import type { AuthUser as TokenUser } from "../../../shared/plugins/auth";
import type { SocketUser } from "./types";

export function decodeUserToken(
  fastify: FastifyInstance,
  socket: Socket
): TokenUser | null {
  const token = socket.handshake.auth?.token;
  if (!token) return null;

  const jwt = (fastify as any).jwt;
  if (!jwt) return null;

  try {
    const payload = jwt.verify(token) as TokenUser;
    return {
      userId: payload.userId,
      email: payload.email,
      display_name: payload.display_name,
    };
  } catch {
    fastify.log.warn("Invalid JWT in websocket handshake");
    return null;
  }
}

export async function ensureSocketUser(
  fastify: FastifyInstance,
  socket: Socket,
  userServiceUrl: string
): Promise<SocketUser> {
  let user = (socket.data.user as SocketUser | TokenUser | undefined) ?? null;

  if (!user) {
    user = {
      userId: null,
      email: null,
      display_name: `Guest#${Math.floor(Math.random() * 9999)}`,
    };
    socket.data.user = user;

    fastify.log.info(
      { socketId: socket.id, as: user.display_name },
      "Guest connected to Pong service"
    );
    return user;
  }

  if (!user.display_name && user.userId !== null) {
    try {
      const res = await fetch(`${userServiceUrl}/users/${user.userId}`);
      if (res.ok) {
        const data = (await res.json()) as { display_name?: string };
        user.display_name = data.display_name || user.email || "User";
      }
    } catch {
      fastify.log.warn(
        { userId: user.userId },
        "Could not fetch display name for authenticated user"
      );
    }
  }

  socket.data.user = user;

  fastify.log.info(
    {
      socketId: socket.id,
      userId: user.userId,
      displayName: user.display_name,
    },
    "Authenticated player connected via WebSocket"
  );

  return user;
}

export function getDisplayName(user: SocketUser): string {
  return (
    user.display_name ||
    (user.userId ? `User#${user.userId}` : "Guest")
  );
}
