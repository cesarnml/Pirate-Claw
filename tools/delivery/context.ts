import * as platformAdapters from './platform-adapters';
import { generateRunDeliverInvocation } from './runtime-config';
import type { ResolvedOrchestratorConfig } from './runtime-config';

export type PlatformAdapters = typeof platformAdapters;

export type DeliveryOrchestratorContext = {
  config: ResolvedOrchestratorConfig;
  invocation: string;
  platform: PlatformAdapters;
};

export function createDeliveryOrchestratorContext(
  config: ResolvedOrchestratorConfig,
): DeliveryOrchestratorContext {
  return {
    config,
    invocation: generateRunDeliverInvocation(config.packageManager),
    platform: platformAdapters,
  };
}
