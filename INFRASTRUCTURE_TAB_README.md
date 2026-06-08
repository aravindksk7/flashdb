# Infrastructure Tab: Contract Compliance, Release Gates & Feature Flags

## Overview

The new **Infrastructure** tab in the FlashDB Management console provides three integrated dashboards for operational and release management:

1. **Contract Compliance Dashboard** - Monitor provider SLA compliance
2. **Release Gates Dashboard** - Track release readiness and blockers
3. **Feature Flags Dashboard** - Manage and monitor feature rollouts

## Accessing the Infrastructure Tab

1. Open the FlashDB Management console
2. Click the **Infrastructure** tab in the main navigation
3. All three dashboards are displayed in a single view

---

## Contract Compliance Dashboard

### Purpose
Monitor provider contract compliance and SLA adherence in real-time.

### Key Metrics
- **Overall Compliance Status**: Compliant, Warning, or Non-Compliant
- **Compliance Percentage**: 0-100% score
- **Test Results**: Count of passing, failing, and warning tests
- **Violations**: Any active contract violations
- **Last Check**: When compliance was last verified

### Features
- Real-time SLA monitoring
- Multi-category test organization
- Historical trend analysis
- Violation alerting
- Auto-refresh every 60 seconds

### What to Look For
- **Green Status**: All compliance tests passing
- **Amber/Yellow Status**: One or more warnings, but still compliant
- **Red Status**: One or more test failures, contract non-compliance

### Typical Response Time
- Page load: < 500ms
- Auto-refresh: 60 seconds

### API Endpoints
```
GET /api/contracts/compliance
GET /api/contracts/compliance/detailed
```

---

## Release Gates Dashboard

### Purpose
Track the status of release gates and identify blockers preventing releases.

### Key Metrics
- **Total Gates**: Number of release gates in the pipeline
- **Gate Status**: Closed (completed), Open (in progress), Blocked, Closing
- **Overall Status**: On-track, At-risk, or Blocked
- **Checklist Progress**: Per-gate completion percentage
- **Blockers**: Reasons preventing gate progression

### Understanding Gate Status
- **Closed**: Gate requirements met, ready to proceed
- **Open**: Gate is actively being worked on, progressing normally
- **Closing**: Gate is finalizing, nearly complete
- **Blocked**: Gate has blocking issues preventing progress

### Understanding Priority Levels
- **Critical**: Blocks release, must resolve
- **High**: Important, should resolve soon
- **Medium**: Can wait, but good to have
- **Low**: Nice to have, can defer

### Features
- Multi-gate tracking with dependencies
- Blocking factor identification
- Checklist-based progress tracking
- Timeline tracking (planned vs actual)
- Gate dependency visualization
- Auto-refresh every 30 seconds

### Exploring Gate Details
Click on any gate to expand and see:
- Blocking factors (with warning icons)
- Detailed checklist with completion timestamps
- Dependencies on other gates
- Owner team information
- Timeline details

### What to Look For
- **Red blocked gates**: Take priority, coordinate with owners
- **Amber/yellow gates**: Monitor progress, support if needed
- **Green closed gates**: Successfully completed, can proceed
- **Delays**: Gates showing "delayed" status vs planned date

### Typical Use Cases
1. **Pre-release**: Check all gates are closed before deploying
2. **Unblocking**: Identify blockers and coordinate resolution
3. **Planning**: Assess gate dependencies for sequencing
4. **Monitoring**: Track release progress in real-time

### API Endpoints
```
GET /api/release-gates/status
GET /api/release-gates/:gateId
```

---

## Feature Flags Dashboard

### Purpose
Manage feature flag rollouts and monitor adoption across the user base.

### Key Metrics
- **Total Flags**: Number of active feature flags
- **Enabled**: Fully enabled (100% rollout)
- **Beta**: Rolling out (0-99% rollout)
- **Disabled**: Not yet enabled or deactivated

### Feature Flag Statuses
- **Enabled**: Feature is fully enabled for all users (100% rollout)
- **Beta**: Feature is rolling out gradually (0-99% rollout)
- **Disabled**: Feature is not available to users
- **Deprecated**: Feature is marked for removal

### Badge System
- **[NEW]**: Recently created flag
- **[BETA]**: Currently rolling out
- **[DEPRECATED]**: Marked for removal

### Understanding Rollout Percentage
- **0%**: Feature disabled, no users affected
- **1-50%**: Early rollout, minority of users affected
- **51-99%**: Majority of users affected, some still on old version
- **100%**: Fully rolled out, all users on new version

### Features
- Complete feature flag inventory
- Gradual rollout management (0-100%)
- Real-time user distribution tracking
- Performance comparison (new vs old version)
- Error rate monitoring during rollout
- Historical change tracking
- Recently-changed indicators
- Auto-refresh every 60 seconds

### Managing Rollout Percentages

#### For Beta Flags Only:
1. Click on the beta flag to expand details
2. Look for the "Adjust Rollout Percentage" section
3. Either:
   - Drag the **slider** to set precise percentage
   - Click **quick-select buttons** (10%, 25%, 50%, 75%, 100%)
4. Changes apply in real-time via API

#### Rollout Strategy Recommendations
- **10-25%**: Early adopter phase, look for issues
- **25-50%**: Expanded testing, monitor metrics
- **50-75%**: Majority rollout, prepare for 100%
- **75-90%**: Nearly complete, address final issues
- **90-100%**: Final push, complete transition

### What to Look For
- **[NEW] Badges**: Review recently added features
- **[BETA] Badges**: Monitor rollout progress
- **High error rates**: Pause rollout if errors spike
- **Performance degradation**: May indicate issues with new version
- **User affected count**: Verify rollout is proceeding as expected

### Rollout Safety
- Always start with small percentages (10-25%)
- Monitor error rates at each step
- Check performance metrics
- Have a rollback plan ready
- Gradually increase percentage as confidence grows

### Typical Rollout Timeline
- Day 1-2: 10% (early testing)
- Day 3-4: 25% (expanded testing)
- Day 5-6: 50% (majority testing)
- Day 7-8: 75% (final push)
- Day 9-10: 100% (complete)

### API Endpoints
```
GET /api/features
GET /api/features/:flagName
GET /api/features/:flagName/rollout
PUT /api/features/:flagName
GET /api/features/:flagName/history
```

---

## Color Coding Guide

### Status Colors
- **Green** (✓): Compliant, Closed, Enabled, Passing
- **Cyan** (◯): Neutral, Open, In Progress
- **Amber** (⚠): Warning, At Risk, Beta, Delayed
- **Red** (✗): Failed, Blocked, Non-Compliant
- **Violet**: Informational, Dependencies

### Visual Indicators
- **Solid bars**: Progress/completion
- **Progress fill**: Current state vs target
- **Badges/Chips**: Status labels
- **Icons**: Action status (check, warning, cross)

---

## Common Questions

### Q: How often do the dashboards refresh?
**A**: 
- Compliance: Every 60 seconds
- Release Gates: Every 30 seconds  
- Feature Flags: Every 60 seconds

You can also manually refresh anytime via the main refresh button.

### Q: Can I modify release gates?
**A**: Release gate details are currently read-only. Contact the gate owner to make changes.

### Q: How do I pause a feature flag rollout?
**A**: Use the slider or buttons to set rollout percentage to 0% (or lower percentage to pause expansion).

### Q: Can I rollback a feature flag?
**A**: Yes, reduce the rollout percentage to 0% to disable the feature for all users.

### Q: What does "recently changed" mean?
**A**: The feature flag was modified in the last 24 hours.

### Q: How is "users affected" calculated?
**A**: It's the number of users on the new version = (rollout % × total users).

---

## Troubleshooting

### Dashboard Not Loading
1. Check browser console for errors
2. Verify API is running and accessible
3. Check network tab for failed requests
4. Try refreshing the page

### Auto-Refresh Not Working
1. Check browser developer tools
2. Verify WebSocket/polling connection
3. Check browser console for errors
4. Try manual refresh

### Feature Flag Update Not Applied
1. Verify rollout percentage was valid (0-100)
2. Check API response in browser console
3. Try updating again
4. Contact DevOps if issue persists

### Missing Compliance Checks
1. Verify compliance endpoint is running
2. Check if all test runners are active
3. Review test configuration
4. Check API logs for errors

---

## API Response Examples

### Compliance Status
```json
{
  "overallCompliance": "compliant",
  "compliancePercentage": 98.5,
  "testsPassing": 47,
  "testsFailing": 0,
  "testsWarning": 1
}
```

### Release Gate
```json
{
  "name": "Contract Compliance Verification",
  "status": "blocked",
  "checklistProgress": 0,
  "priority": "critical",
  "blockingFactors": ["Compliance dashboard not yet implemented"]
}
```

### Feature Flag
```json
{
  "name": "FLASHDB_ENABLE_REPAIR",
  "displayName": "Clone Repair & Validation",
  "status": "beta",
  "rolloutPercentage": 65,
  "usersAffected": 650,
  "badges": ["BETA"]
}
```

---

## Integration with Other Tabs

### Dashboard Tab
- Provides system-wide metrics and health status
- Complements Infrastructure tab operational view

### Management Tab
- Create and manage golden images and clones
- Feature flags control feature availability in Management tab

### Audit Tab
- Review operations and changes
- Feature flag history available in Infrastructure tab

### Deployment Tab
- Release procedures and guides
- Release gates status helps plan deployments

---

## Best Practices

### Contract Compliance
- Check daily before morning standup
- Alert team immediately if non-compliant
- Review detailed report weekly for trends
- Maintain trending upward over time

### Release Gates
- Check gates before planning releases
- Involve gate owners to resolve blockers early
- Track timeline variances (planned vs actual)
- Communicate delays to stakeholders

### Feature Flags
- Always start rollouts at 10-25%
- Monitor error rates at each step
- Compare performance before expanding
- Document rollout decisions
- Keep rollout pace reasonable (don't rush)

---

## Support

For issues or questions:
1. Check the API logs: Check `/api/health` endpoint
2. Review the test results in Compliance dashboard
3. Contact the Infrastructure team
4. File an issue in the project repository

---

## Version History

- **v0.1.0** (2026-06-08): Initial release
  - Contract Compliance Dashboard
  - Release Gates Dashboard
  - Feature Flags Dashboard
  - Real-time monitoring and management capabilities
