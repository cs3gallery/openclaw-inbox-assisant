import { checkPostgresHealth } from '../../db/postgres/client';
import { checkQdrantHealth } from '../../db/qdrant/client';
import { checkRedisHealth } from '../../db/redis/client';

type DependencyStatus = {
  status: 'ok' | 'error';
  latencyMs: number;
  error?: string;
};

type ReadinessHealthResponse = {
  service: string;
  status: 'ok' | 'degraded';
  timestamp: string;
  uptimeSeconds: number;
  dependencies: {
    postgres: DependencyStatus;
    redis: DependencyStatus;
    qdrant: DependencyStatus;
  };
};

type HealthSummaryResponse = {
  service: string;
  status: 'ok' | 'degraded';
  timestamp: string;
  dependencies: Record<'postgres' | 'redis' | 'qdrant', 'ok' | 'error'>;
};

async function measureDependencyHealth(check: () => Promise<void>): Promise<DependencyStatus> {
  const startedAt = Date.now();

  try {
    await check();
    return {
      status: 'ok',
      latencyMs: Date.now() - startedAt
    };
  } catch (error) {
    return {
      status: 'error',
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export async function getReadinessHealth(service: string): Promise<ReadinessHealthResponse> {
  const [postgres, redis, qdrant] = await Promise.all([
    measureDependencyHealth(checkPostgresHealth),
    measureDependencyHealth(checkRedisHealth),
    measureDependencyHealth(checkQdrantHealth)
  ]);

  const status =
    postgres.status === 'ok' && redis.status === 'ok' && qdrant.status === 'ok'
      ? 'ok'
      : 'degraded';

  return {
    service,
    status,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    dependencies: {
      postgres,
      redis,
      qdrant
    }
  };
}

export function getHealthSummary(service: string, readiness: ReadinessHealthResponse): HealthSummaryResponse {
  return {
    service,
    status: readiness.status,
    timestamp: readiness.timestamp,
    dependencies: {
      postgres: readiness.dependencies.postgres.status,
      redis: readiness.dependencies.redis.status,
      qdrant: readiness.dependencies.qdrant.status
    }
  };
}

export function getLivenessHealth(service: string): Omit<ReadinessHealthResponse, 'dependencies'> {
  return {
    service,
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime())
  };
}
