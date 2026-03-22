import type { FastifyReply, FastifyRequest } from 'fastify';

import { env } from '../../config/env';

export function assertToolApiAuth(request: FastifyRequest, reply: FastifyReply): boolean {
  if (!env.OPENCLAW_TOOL_API_BEARER_TOKEN) {
    reply.code(503);
    void reply.send({
      error: 'OPENCLAW_TOOL_API_BEARER_TOKEN is not configured'
    });
    return false;
  }

  const authorization = request.headers.authorization;
  const expected = `Bearer ${env.OPENCLAW_TOOL_API_BEARER_TOKEN}`;

  if (authorization !== expected) {
    reply.code(401);
    void reply.send({
      error: 'Unauthorized'
    });
    return false;
  }

  return true;
}
