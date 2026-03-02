# Auth Rollout Runbook

This runbook covers rollout of the unified auth identity transition:

- anonymous Firebase auth remains the session anchor
- Apple / ETH / SOL can be linked and unlinked on one profile
- profile merge is deterministic (`rating = min(...)`)
- method ownership is enforced via `authMethodIndex`

## Environment Additions

Set these before rollout.

### Cloud Functions env

Recommended location (Firebase Functions v2): `cloud/functions/.env.<project-id>` (for example `.env.mons-link`).

| Key | Required | Example | Notes |
| --- | --- | --- | --- |
| `APPLE_CLIENT_ID` | Yes (or `APPLE_AUDIENCES`) | `com.mons.web` | Apple audience accepted by backend token verification. |
| `APPLE_AUDIENCES` | Optional | `com.mons.web,com.mons.staging` | Comma-separated allowlist. Overrides single-client-id mode. |
| `SIWE_ALLOWED_DOMAINS` | Yes | `mons.link,www.mons.link,staging.mons.link,localhost,127.0.0.1` | Required for ETH SIWE domain/URI validation. |
| `AUTH_DISABLE_APPLE_VERIFY` | Yes | `true` during initial deploy | Kill switch for Apple verify endpoint. |
| `AUTH_DISABLE_UNLINK` | Yes | `true` during initial deploy | Kill switch for unlink endpoint. |
| `AUTH_DISABLE_MERGE` | Yes | `true` during initial deploy | Kill switch for cross-profile merge. |

Flag values are treated as disabled when set to: `1`, `true`, or `yes` (case-insensitive).
To enable a feature, set the flag to `false` (or remove the key).

### Web app env

Set in root app env (`/Users/ivan/Developer/mons/link/.env` or deployment env):

| Key | Required | Example | Notes |
| --- | --- | --- | --- |
| `REACT_APP_APPLE_CLIENT_ID` | Yes | `com.mons.web` | Must match Apple web Service ID used for `id_token`. |
| `REACT_APP_APPLE_REDIRECT_URI` | Optional | `https://mons.link` | If omitted, frontend uses `window.location.origin`. Must be whitelisted in Apple config. |

## Deployment Order

Run these steps in order.

1. Prepare Apple configuration
- In Apple Developer, ensure web Sign in with Apple is configured for your domain(s).
- Ensure returned audience matches `APPLE_CLIENT_ID` or one value in `APPLE_AUDIENCES`.
- Ensure redirect URI matches `REACT_APP_APPLE_REDIRECT_URI` (or site origin if omitted).

2. Preflight audit (production data, no writes)
- From `/Users/ivan/Developer/mons/link/cloud/admin`:
```bash
gcloud auth application-default login
node preflightAuthAudit.js --project mons-link --out /tmp/auth_preflight_report.json
```
- Block rollout if any of these are non-zero:
  - `duplicateEthCount`
  - `duplicateSolCount`
  - `duplicateAppleCount`
  - `conflictingLoginsCount`
- Investigate (but do not necessarily block) when non-zero:
  - `loginProfileLinkMismatchesCount` (can be auto-repaired by `syncProfileClaim` on user activity)

3. Deploy backend in safe mode (features gated)
- Set:
  - `AUTH_DISABLE_APPLE_VERIFY=true`
  - `AUTH_DISABLE_UNLINK=true`
  - `AUTH_DISABLE_MERGE=true`
- Note: ETH/SOL verification accepts both `intentId` and legacy UID-nonce sign-in during transition. Keep backend+frontend rollout coordinated and remove legacy fallback in a follow-up cleanup release.
- Deploy functions from `/Users/ivan/Developer/mons/link/cloud`:
```bash
firebase deploy --only functions --project mons-link
```

4. Backfill `authMethodIndex`
- From `/Users/ivan/Developer/mons/link/cloud/admin`:
```bash
node backfillAuthMethodIndex.js --project mons-link --dry-run
node backfillAuthMethodIndex.js --project mons-link
```
- If output shows conflicts, stop and resolve ownership before proceeding.

5. Re-run preflight audit
- Confirm no new conflicts or malformed identities:
```bash
node preflightAuthAudit.js --project mons-link --out /tmp/auth_preflight_post_backfill.json
```

6. Enable merge first, keep Apple/unlink off
- Set:
  - `AUTH_DISABLE_MERGE=false`
  - `AUTH_DISABLE_APPLE_VERIFY=true`
  - `AUTH_DISABLE_UNLINK=true`
- Deploy functions.
- Run canary checks for ETH/SOL sign-in and ETH<->SOL linking only.

7. Deploy frontend with settings + Apple UI
- Deploy web app after backend callables are live.
- Keep Apple verify disabled until backend canary is stable.

8. Enable Apple verify for canary cohort
- Set:
  - `AUTH_DISABLE_APPLE_VERIFY=false`
  - `AUTH_DISABLE_UNLINK=true`
  - `AUTH_DISABLE_MERGE=false`
- Deploy functions.
- Run Apple-first and wallet-first link tests on canary users.

9. Enable unlink last
- Set:
  - `AUTH_DISABLE_UNLINK=false`
- Deploy functions.
- Verify unlink guard blocks removing the last remaining method.

10. Full rollout
- Ramp from canary to full traffic.
- Keep all three kill switches available for instant rollback.

## Backfill and Data Safety Notes

- Backfill is idempotent and safe to rerun.
- `readProfileByMethod` already has legacy field fallback; index backfill is still required for consistency and concurrency guarantees.
- Merges are lock-protected via `mergeLocks` and operation-id logged via `authOps`.

## Smoke Test Checklist

Run end-to-end after each enablement phase:

1. anon -> Apple sign-in creates one profile and sets `players/{uid}/profile`.
2. Apple-first -> add ETH -> both Apple and ETH sign into same profile.
3. Apple-first -> add SOL -> both Apple and SOL sign into same profile.
4. ETH-first -> add SOL and SOL-first -> add ETH both converge to one profile.
5. Wallet-first -> add Apple does not create duplicate profile.
6. Unlink blocked when only one method remains.
7. Unlink succeeds with 2+ methods and removed method can no longer sign in.
8. Collision merge keeps current profile as target and applies `rating=min`.
9. Profile remap updates projector output (`users/{profileId}/games`) correctly.
10. `syncProfileClaim` restores missing claim/profile link for active UID.

## Apple Compliance Notes

- Keep Apple account linking user-initiated (settings/sign-in actions).
- Do not expose raw Apple `sub` or full email to clients.
- Ensure Apple domain and redirect config matches production and any staged domain used in rollout.

## Observability During Rollout

Monitor logs/metrics for:

- verify success/failure rate by method
- `merge-method-conflict`
- `merge-lock-active`
- `cannot-remove-last-method`
- `method-unlinked`
- `apple-audience-mismatch` / `apple-nonce-mismatch`
- index ownership conflicts reported by backfill/audit

Use:
```bash
cd /Users/ivan/Developer/mons/link/cloud
firebase functions:log --project mons-link
```

## Rollback Playbook

For immediate stabilization, set and deploy:

- `AUTH_DISABLE_APPLE_VERIFY=true`
- `AUTH_DISABLE_UNLINK=true`
- `AUTH_DISABLE_MERGE=true` (only if merge path is the issue)

Then:

1. Keep ETH/SOL sign-in operational using existing linked methods.
2. Pause rollout cohort expansion.
3. Run `preflightAuthAudit.js` and `backfillAuthMethodIndex.js --dry-run` to identify drift/conflicts.
4. Re-enable features one by one after fixes.
