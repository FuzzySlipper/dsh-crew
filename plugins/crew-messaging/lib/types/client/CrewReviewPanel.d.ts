/** Browser panel for the private Crew review worker pool. */
import type { ReactNode } from 'react';
import type { CrewReviewDashboardSnapshot } from '../dashboard/types.ts';
export declare const CREW_REVIEW_DASHBOARD_ENDPOINT = "/plugins/dsh-crew-messaging/review-pool";
export declare const CREW_REVIEW_AFFINITY_ENDPOINT = "/plugins/dsh-crew-messaging/review-affinity";
/** Decode only the plugin-owned review projection and discard unknown fields. */
export declare function decodeCrewReviewDashboard(value: unknown): CrewReviewDashboardSnapshot | undefined;
/** Render pool health, bounded review evidence, and the idle-affinity release control. */
export declare function CrewReviewPanel(): ReactNode;
//# sourceMappingURL=CrewReviewPanel.d.ts.map