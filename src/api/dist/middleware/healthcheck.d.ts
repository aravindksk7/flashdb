import { Request, Response } from 'express';
/**
 * Main health check endpoint
 */
export declare function healthCheckEndpoint(_req: Request, res: Response): Promise<void>;
/**
 * Lightweight health check (for load balancers)
 */
export declare function livelinessProbe(_req: Request, res: Response): void;
/**
 * Readiness check (for orchestrators)
 */
export declare function readinessProbe(_req: Request, res: Response): Promise<void>;
//# sourceMappingURL=healthcheck.d.ts.map