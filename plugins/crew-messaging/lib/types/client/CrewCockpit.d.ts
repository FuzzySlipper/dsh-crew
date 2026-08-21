/** Read-only global Crew settings cockpit. */
import type { ReactNode } from 'react';
import type { CrewDashboardSnapshot } from '../dashboard/types.ts';
export declare const CREW_DASHBOARD_ENDPOINT = "/plugins/dsh-crew-messaging/dashboard";
/** Decode the narrow response the Host projection owns. */
export declare function decodeCrewDashboard(value: unknown): CrewDashboardSnapshot | undefined;
/** Render the v1 Crew global settings page. */
export declare function CrewCockpit(): ReactNode;
//# sourceMappingURL=CrewCockpit.d.ts.map