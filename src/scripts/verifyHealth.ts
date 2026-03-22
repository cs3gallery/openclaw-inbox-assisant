import { strict as assert } from 'node:assert';

const appBaseUrl = process.env.APP_BASE_URL ?? 'http://127.0.0.1:3400';
const workerBaseUrl = process.env.WORKER_BASE_URL ?? 'http://127.0.0.1:3401';

async function fetchJson(url: string): Promise<{ status: number; body: unknown }> {
  const response = await fetch(url);
  const body = (await response.json()) as unknown;

  return {
    status: response.status,
    body
  };
}

function assertDependencyMap(body: unknown): void {
  assert(body && typeof body === 'object', 'Expected object body');
  assert('dependencies' in body, 'Expected dependencies key');
  const dependencies = (body as Record<string, unknown>).dependencies;
  assert(dependencies && typeof dependencies === 'object', 'Expected dependency map');
  assert(
    ['postgres', 'redis', 'qdrant'].every((name) => name in (dependencies as Record<string, unknown>)),
    'Expected postgres/redis/qdrant dependencies'
  );
}

async function verifyService(baseUrl: string, serviceName: 'app' | 'worker'): Promise<void> {
  const livez = await fetchJson(`${baseUrl}/livez`);
  assert.equal(livez.status, 200, `${serviceName} /livez should return 200`);
  assert.equal((livez.body as Record<string, unknown>).status, 'ok');
  assert(!('dependencies' in (livez.body as Record<string, unknown>)), `${serviceName} /livez must not include dependency state`);

  const readyz = await fetchJson(`${baseUrl}/readyz`);
  assert.equal(readyz.status, 200, `${serviceName} /readyz should return 200`);
  assertDependencyMap(readyz.body);

  const readyDependencies = (readyz.body as Record<string, any>).dependencies;
  for (const dependencyName of ['postgres', 'redis', 'qdrant']) {
    assert.equal(readyDependencies[dependencyName].status, 'ok', `${serviceName} ${dependencyName} should be ready`);
    assert.equal(typeof readyDependencies[dependencyName].latencyMs, 'number');
  }

  const health = await fetchJson(`${baseUrl}/health`);
  assert.equal(health.status, 200, `${serviceName} /health should return 200`);
  assertDependencyMap(health.body);

  const healthDependencies = (health.body as Record<string, any>).dependencies;
  for (const dependencyName of ['postgres', 'redis', 'qdrant']) {
    assert.equal(healthDependencies[dependencyName], 'ok', `${serviceName} /health should summarize dependency state`);
  }
}

async function main(): Promise<void> {
  await verifyService(appBaseUrl, 'app');
  await verifyService(workerBaseUrl, 'worker');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
