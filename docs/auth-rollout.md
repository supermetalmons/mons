# Auth Rollout Runbook

This runbook covers rollout of the unified auth identity transition:

- anonymous Firebase auth remains the session anchor
- Apple / Google / ETH / SOL can be linked and unlinked on one profile
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
| `GOOGLE_CLIENT_ID` | Yes (or `GOOGLE_AUDIENCES`) | `1234567890-abcdef.apps.googleusercontent.com` | Google audience accepted by backend token verification. |
| `GOOGLE_AUDIENCES` | Optional | `123.apps.googleusercontent.com,456.apps.googleusercontent.com` | Comma-separated allowlist. Overrides single-client-id mode. |
| `SIWE_ALLOWED_DOMAINS` | Yes | `mons.link,www.mons.link,staging.mons.link,localhost,127.0.0.1` | Required for ETH SIWE domain/URI validation. |
| `AUTH_DISABLE_APPLE_VERIFY` | Yes | `true` during initial deploy | Kill switch for Apple verify endpoint. |
| `AUTH_DISABLE_GOOGLE_VERIFY` | Yes | `true` during initial deploy | Kill switch for Google verify endpoint. |
| `AUTH_DISABLE_UNLINK` | Yes | `true` during initial deploy | Kill switch for unlink endpoint. |
| `AUTH_DISABLE_MERGE` | Yes | `true` during initial deploy | Kill switch for cross-profile merge. |

Flag values are treated as disabled when set to: `1`, `true`, or `yes` (case-insensitive).
To enable a feature, set the flag to `false` (or remove the key).

### Web app env

Set in root app env (`/Users/ivan/Developer/mons/link/.env` or deployment env):

| Key | Required | Example | Notes |
| --- | --- | --- | --- |
| `REACT_APP_APPLE_CLIENT_ID` | Yes | `com.mons.web` | Must match Apple web Service ID used for `id_token`. |

Google client ID is configured via hardcoded placeholder in frontend source:

- File: `/Users/ivan/Developer/mons/link/src/connection/googleConnection.ts`
- Constant: `GOOGLE_CLIENT_ID`
- Replace default value `REPLACE_WITH_YOUR_GOOGLE_WEB_CLIENT_ID.apps.googleusercontent.com` with your production Google web client ID.

## Deployment Order

Run these steps in order.

1. Prepare provider configuration
- In Apple Developer, ensure web Sign in with Apple is configured for your domain(s).
- Ensure Apple returned audience matches `APPLE_CLIENT_ID` or one value in `APPLE_AUDIENCES`.
- Ensure Apple redirect URI includes the hardcoded web callback origin `https://mons.link`.
- In Google Cloud Console, ensure Google Identity Services web client is configured for your domain(s).
- Ensure Google returned audience matches `GOOGLE_CLIENT_ID` or one value in `GOOGLE_AUDIENCES`.

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
  - `duplicateGoogleCount`
  - `conflictingLoginsCount`
- Investigate (but do not necessarily block) when non-zero:
  - `loginProfileLinkMismatchesCount` (can be auto-repaired by `syncProfileClaim` on user activity)

3. Deploy backend in safe mode (features gated)
- Set:
  - `AUTH_DISABLE_APPLE_VERIFY=true`
  - `AUTH_DISABLE_GOOGLE_VERIFY=true`
  - `AUTH_DISABLE_UNLINK=true`
  - `AUTH_DISABLE_MERGE=true`
- Note: ETH/SOL verification now requires `intentId` for all sign-ins. Keep backend+frontend rollout coordinated to avoid old clients attempting legacy UID-nonce sign-in.
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

6. Enable merge first, keep Apple/Google/unlink off
- Set:
  - `AUTH_DISABLE_MERGE=false`
  - `AUTH_DISABLE_APPLE_VERIFY=true`
  - `AUTH_DISABLE_GOOGLE_VERIFY=true`
  - `AUTH_DISABLE_UNLINK=true`
- Deploy functions.
- Run canary checks for ETH/SOL sign-in and ETH<->SOL linking only.

7. Deploy frontend with settings + Apple/Google UI
- Deploy web app after backend callables are live.
- Keep Apple/Google verify disabled until backend canary is stable.

8. Enable Apple verify for canary cohort
- Set:
  - `AUTH_DISABLE_APPLE_VERIFY=false`
  - `AUTH_DISABLE_GOOGLE_VERIFY=true`
  - `AUTH_DISABLE_UNLINK=true`
  - `AUTH_DISABLE_MERGE=false`
- Deploy functions.
- Run Apple-first and wallet-first link tests on canary users.

9. Enable Google verify for canary cohort
- Set:
  - `AUTH_DISABLE_GOOGLE_VERIFY=false`
  - `AUTH_DISABLE_UNLINK=true`
  - `AUTH_DISABLE_MERGE=false`
- Deploy functions.
- Run Google-first and wallet-first link tests on canary users.

10. Enable unlink last
- Set:
  - `AUTH_DISABLE_UNLINK=false`
- Deploy functions.
- Verify unlink guard blocks removing the last remaining method.

11. Full rollout
- Ramp from canary to full traffic.
- Keep all verify/unlink/merge kill switches available for instant rollback.

## Backfill and Data Safety Notes

- Backfill is idempotent and safe to rerun.
- `readProfileByMethod` already has legacy field fallback; index backfill is still required for consistency and concurrency guarantees.
- Merges are lock-protected via `mergeLocks` and operation-id logged via `authOps`.
- Unlink now applies a 24-hour cooldown to:
  - the unlinked method value (`authMethodRevocations`)
  - the unlinking profile+method type (`authProfileMethodCooldowns`)
- Run periodic cleanup to remove expired method cooldown docs:
```bash
cd /Users/ivan/Developer/mons/link/cloud/admin
node cleanupAuthMethodRevocations.js --project mons-link --dry-run
node cleanupAuthMethodRevocations.js --project mons-link
```

## Smoke Test Checklist

Run end-to-end after each enablement phase:

1. anon -> Apple sign-in creates one profile and sets `players/{uid}/profile`.
2. anon -> Google sign-in creates one profile and sets `players/{uid}/profile`.
3. Apple-first -> add ETH -> both Apple and ETH sign into same profile.
4. Google-first -> add ETH -> both Google and ETH sign into same profile.
5. Apple-first -> add SOL -> both Apple and SOL sign into same profile.
6. Google-first -> add SOL -> both Google and SOL sign into same profile.
7. ETH-first -> add SOL and SOL-first -> add ETH both converge to one profile.
8. Wallet-first -> add Apple does not create duplicate profile.
9. Wallet-first -> add Google does not create duplicate profile.
10. Unlink blocked when only one method remains.
11. Unlink succeeds with 2+ methods and writes 24-hour cooldowns for method reuse and same-type relinking.
12. During cooldown, signing in with that recently unlinked method is blocked with `method-reuse-cooldown`.
13. During cooldown, linking another method of that type on the unlinking profile is blocked with `profile-method-cooldown`.
14. Collision merge keeps current profile as target and applies `rating=min`.
15. Profile remap updates projector output (`users/{profileId}/games`) correctly.
16. `syncProfileClaim` restores missing claim/profile link for active UID.

## Apple/Google Compliance Notes

- Keep Apple and Google account linking user-initiated (settings/sign-in actions).
- Do not expose raw Apple/Google `sub` values or full email to clients.
- Ensure Apple and Google domain/audience configuration matches production and any staged domain used in rollout.

## Observability During Rollout

Monitor logs/metrics for:

- verify success/failure rate by method
- `merge-method-conflict`
- `merge-lock-active`
- `cannot-remove-last-method`
- `method-reuse-cooldown`
- `profile-method-cooldown`
- `apple-audience-mismatch` / `apple-nonce-mismatch`
- `google-audience-mismatch` / `google-nonce-mismatch`
- index ownership conflicts reported by backfill/audit

Use:
```bash
cd /Users/ivan/Developer/mons/link/cloud
firebase functions:log --project mons-link
```

## Rollback Playbook

For immediate stabilization, set and deploy:

- `AUTH_DISABLE_APPLE_VERIFY=true`
- `AUTH_DISABLE_GOOGLE_VERIFY=true`
- `AUTH_DISABLE_UNLINK=true`
- `AUTH_DISABLE_MERGE=true` (only if merge path is the issue)

Then:

1. Keep existing linked method sign-in operational while Google/Apple verify are disabled.
2. Pause rollout cohort expansion.
3. Run `preflightAuthAudit.js` and `backfillAuthMethodIndex.js --dry-run` to identify drift/conflicts.
4. Re-enable features one by one after fixes.
