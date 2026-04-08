export type ReviewPollingProfile = {
  intervalMinutes: number;
  maxWaitMinutes: number;
  /** When true, allow one extra poll at max+interval if agents are still in flight at the max check. */
  extendByOneInterval: boolean;
};

export const DEFAULT_REVIEW_POLLING_PROFILE: ReviewPollingProfile = {
  intervalMinutes: 2,
  maxWaitMinutes: 10,
  extendByOneInterval: true,
};

export function computeExtendedReviewPollMaxWaitMinutes(
  intervalMinutes: number,
  maxWaitMinutes: number,
): number {
  return maxWaitMinutes + intervalMinutes;
}

export function resolveDeliveryReviewPollingProfile(state: {
  reviewPollIntervalMinutes: number;
  reviewPollMaxWaitMinutes: number;
}): ReviewPollingProfile {
  return {
    intervalMinutes: state.reviewPollIntervalMinutes,
    maxWaitMinutes: state.reviewPollMaxWaitMinutes,
    extendByOneInterval: true,
  };
}
