import type { FastifyReply, FastifyRequest } from 'fastify';

import { env } from '../../config/env';

export function assertOpenClawBridgeAuth(request: FastifyRequest, reply: FastifyReply): boolean {
  if (!env.OPENCLAW_BRIDGE_SHARED_SECRET) {
    reply.code(503);
    void reply.send({
      error: 'OPENCLAW_BRIDGE_SHARED_SECRET is not configured'
    });
    return false;
  }

  const providedSecret = request.headers['x-openclaw-shared-secret'];

  if (providedSecret !== env.OPENCLAW_BRIDGE_SHARED_SECRET) {
    reply.code(401);
    void reply.send({
      error: 'Unauthorized'
    });
    return false;
  }

  return true;
}
