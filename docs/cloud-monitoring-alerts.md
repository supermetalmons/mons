# Cloud Monitoring Alerts (Functions Reliability)

Use these commands to create the reliability alerts for `mons-link`.

## 1) Log-based metric for CPU allocation quota errors

```bash
PROJECT_ID="mons-link"

gcloud logging metrics create cf_cpu_allocation_quota_exceeded \
  --project "${PROJECT_ID}" \
  --description "Cloud Run request failures caused by CPU allocation quota exhaustion" \
  --log-filter "resource.type=\"cloud_run_revision\" AND logName=\"projects/${PROJECT_ID}/logs/run.googleapis.com%2Frequests\" AND textPayload:\"run.googleapis.com/cpu_allocation\""
```

## 2) Log-based metrics for function errors

```bash
PROJECT_ID="mons-link"

gcloud logging metrics create cf_sync_event_state_errors \
  --project "${PROJECT_ID}" \
  --description "Error logs for syncEventState callable" \
  --log-filter "resource.type=\"cloud_run_revision\" AND labels.goog-drz-cloudfunctions-id=\"synceventstate\" AND severity>=ERROR"

gcloud logging metrics create cf_event_projector_errors \
  --project "${PROJECT_ID}" \
  --description "Error logs for projectProfileGamesOnEventWritten trigger" \
  --log-filter "resource.type=\"cloud_run_revision\" AND labels.goog-drz-cloudfunctions-id=\"projectprofilegamesoneventwritten\" AND severity>=ERROR"
```

## 3) Create alert policies from the metrics

Create one policy per metric in Google Cloud Monitoring:

1. Condition type: `Metric Threshold`
2. Metric: logging user metric
3. Trigger: `Any time series violates`
4. Threshold:
   - `cf_cpu_allocation_quota_exceeded`: `>= 1` in `5m`
   - `cf_sync_event_state_errors`: `>= 3` in `5m`
   - `cf_event_projector_errors`: `>= 3` in `5m`
5. Notifications: add your on-call channel(s)

## 4) Dashboard for skip-reason distribution

Create a Logs Explorer query and save as chart:

```text
logName="projects/mons-link/logs/run.googleapis.com%2Fstdout"
textPayload:"event:sync:result"
```

Group by JSON payload fields:

- `jsonPayload.reason`
- `jsonPayload.skipped`

This chart is used to tune `rate-limited` / `locked` behavior after rollout.
