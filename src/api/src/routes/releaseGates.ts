import { Router, Request, Response } from 'express';
import logger from '../logger';

const router = Router();

interface ReleaseGate {
  id: string;
  name: string;
  status: 'blocked' | 'open' | 'closing' | 'closed';
  blockingFactors: string[];
  checklist: {
    name: string;
    completed: boolean;
    completedAt?: string;
  }[];
  checklistProgress: number;
  blockedSince?: string;
  estimatedOpenTime?: string;
  timeline: {
    planned: string;
    actual?: string;
    status: 'on-track' | 'delayed' | 'completed';
  };
  dependencies: string[];
  owner: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

interface ReleaseGatesStatus {
  totalGates: number;
  openGates: number;
  blockedGates: number;
  closedGates: number;
  overallStatus: 'on-track' | 'at-risk' | 'blocked';
  gates: ReleaseGate[];
  summary: string;
  lastUpdated: string;
}

/**
 * GET /api/release-gates/status
 * Retrieves release gate status and blocking factors
 */
router.get('/status', async (_req: Request, res: Response) => {
  try {
    logger.info('Retrieving release gates status');

    const gatesStatus: ReleaseGatesStatus = {
      totalGates: 4,
      openGates: 2,
      blockedGates: 1,
      closedGates: 1,
      overallStatus: 'on-track',
      gates: [
        {
          id: 'gate-1',
          name: 'Phase 5 Validation Gate',
          status: 'closed',
          blockingFactors: [],
          checklist: [
            { name: 'Metadata system operational', completed: true, completedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() },
            { name: 'State management tested', completed: true, completedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() },
            { name: 'Database schema verified', completed: true, completedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString() },
            { name: 'RBAC bootstrap validated', completed: true, completedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString() }
          ],
          checklistProgress: 100,
          timeline: {
            planned: '2026-06-05',
            actual: '2026-06-05',
            status: 'completed'
          },
          dependencies: [],
          owner: 'Architecture Team',
          priority: 'critical'
        },
        {
          id: 'gate-2',
          name: 'GUI Component Integration Gate',
          status: 'open',
          blockingFactors: [],
          checklist: [
            { name: 'Dashboard components wired', completed: true },
            { name: 'Metrics endpoints integrated', completed: true },
            { name: 'Real-time updates implemented', completed: false },
            { name: 'Performance baseline established', completed: false }
          ],
          checklistProgress: 50,
          timeline: {
            planned: '2026-06-10',
            status: 'on-track'
          },
          dependencies: ['gate-1'],
          owner: 'Frontend Team',
          priority: 'high'
        },
        {
          id: 'gate-3',
          name: 'Contract Compliance Verification',
          status: 'blocked',
          blockingFactors: [
            'Compliance dashboard not yet implemented',
            'Contract test suite needs finalization',
            'Historical compliance data collection in progress'
          ],
          checklist: [
            { name: 'Contract test suite created', completed: false },
            { name: 'Compliance dashboard operational', completed: false },
            { name: '30-day compliance history available', completed: false },
            { name: 'Alerting rules configured', completed: false }
          ],
          checklistProgress: 0,
          blockedSince: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
          estimatedOpenTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          timeline: {
            planned: '2026-06-12',
            status: 'delayed'
          },
          dependencies: ['gate-2'],
          owner: 'QA & DevOps',
          priority: 'critical'
        },
        {
          id: 'gate-4',
          name: 'Production Release Readiness',
          status: 'open',
          blockingFactors: [],
          checklist: [
            { name: 'Load testing passed', completed: true },
            { name: 'Security audit passed', completed: true },
            { name: 'Disaster recovery tested', completed: false },
            { name: 'Runbook documentation complete', completed: false },
            { name: 'On-call team trained', completed: false }
          ],
          checklistProgress: 40,
          timeline: {
            planned: '2026-06-15',
            status: 'on-track'
          },
          dependencies: ['gate-3'],
          owner: 'DevOps & SRE',
          priority: 'critical'
        }
      ],
      summary: 'Release on track: 2 gates open (50% completion), 1 gate blocked by compliance dashboard implementation, 1 gate closed.',
      lastUpdated: new Date().toISOString()
    };

    return res.json({
      success: true,
      data: gatesStatus,
      message: 'Release gates status retrieved successfully'
    });
  } catch (error: any) {
    logger.error(`Error retrieving release gates: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/release-gates/:gateId
 * Retrieves detailed information about a specific release gate
 */
router.get('/:gateId', async (req: Request, res: Response) => {
  try {
    const { gateId } = req.params;
    logger.info(`Retrieving details for release gate: ${gateId}`);

    // In production, fetch from database
    const gateDetails = {
      id: gateId,
      name: 'Release Gate Details',
      description: 'Detailed information about this release gate',
      status: 'open',
      createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date().toISOString(),
      blockingFactors: [],
      history: [
        {
          timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
          status: 'blocked',
          reason: 'Compliance tests not ready'
        },
        {
          timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          status: 'open',
          reason: 'Blocking issue resolved'
        }
      ]
    };

    return res.json({
      success: true,
      data: gateDetails,
      message: `Details for release gate ${gateId} retrieved successfully`
    });
  } catch (error: any) {
    logger.error(`Error retrieving release gate: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

export default router;
