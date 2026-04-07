import type { CycleResult } from './runtime-artifacts';
import type { Repository } from './repository';

export type CycleSnapshot = {
  status: CycleResult['status'];
  startedAt: string;
  completedAt: string;
  durationMs: number;
};

export type HealthState = {
  startedAt: string;
  lastRunCycle: CycleSnapshot | null;
  lastReconcileCycle: CycleSnapshot | null;
};

export function createHealthState(): HealthState {
  return {
    startedAt: new Date().toISOString(),
    lastRunCycle: null,
    lastReconcileCycle: null,
  };
}

export function recordCycleInHealth(
  health: HealthState,
  result: CycleResult,
): void {
  const snapshot: CycleSnapshot = {
    status: result.status,
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    durationMs: result.durationMs,
  };

  if (result.type === 'run') {
    health.lastRunCycle = snapshot;
  } else if (result.type === 'reconcile') {
    health.lastReconcileCycle = snapshot;
  }
}

export type ApiFetchDeps = {
  repository: Repository;
  health: HealthState;
};

export function createApiFetch(
  deps?: ApiFetchDeps,
): (request: Request) => Response {
  if (!deps) {
    return () => Response.json({ error: 'not found' }, { status: 404 });
  }

  const { repository, health } = deps;

  return (request: Request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      const uptimeMs = Date.now() - new Date(health.startedAt).getTime();
      return Response.json({
        uptime: uptimeMs,
        startedAt: health.startedAt,
        lastRunCycle: health.lastRunCycle,
        lastReconcileCycle: health.lastReconcileCycle,
      });
    }

    if (url.pathname === '/api/status') {
      return Response.json({
        runs: repository.listRecentRunSummaries(),
      });
    }

    if (url.pathname === '/api/candidates') {
      return Response.json({
        candidates: repository.listCandidateStates(),
      });
    }

    return Response.json({ error: 'not found' }, { status: 404 });
  };
}
