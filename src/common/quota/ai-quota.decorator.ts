import { SetMetadata } from '@nestjs/common';

export const AI_QUOTA_KEY = 'aiQuota';

export interface AiQuotaSpec {
  /** Label stored on the usage row, e.g. "website.generate". */
  feature: string;
  /** Weight against the monthly allowance: a reel costs more than a post. */
  credits: number;
  /** Extra credits when the request body sets `generateImage` (a picture costs like one). */
  imageCredits?: number;
}

/**
 * Marks a route as a billable AI generation. AiQuotaInterceptor reserves the
 * credits before the handler runs and refunds them if it fails.
 */
export const AiQuota = (feature: string, credits = 1, imageCredits?: number) =>
  SetMetadata(AI_QUOTA_KEY, { feature, credits, imageCredits } satisfies AiQuotaSpec);
