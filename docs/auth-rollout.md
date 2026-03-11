# Auth Rollout Runbook

This runbook covers the current unified auth rollout:

- anonymous Firebase auth remains the session anchor
- Apple / X / ETH / SOL can be linked and unlinked on one profile
- profile merge is deterministic (`rating = min(...)`)
- method ownership is enforced via `authMethodIndex`

## Environment

Set these before rollout.

### Cloud Functions env

Recommended location: `cloud/functions/.env.<project-id>` such as `.env.mons-link`.

| Key                          | Required                   | Example                                                                  | Notes                                                             |
| ---------------------------- | -------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `APPLE_CLIENT_ID`            | Yes (or `APPLE_AUDIENCES`) | `com.mons.web`                                                           | Apple audience accepted by backend token verification.            |
| `APPLE_AUDIENCES`            | Optional                   | `com.mons.web,com.mons.staging`                                          | Comma-separated allowlist. Overrides single-client-id mode.       |
| `X_CLIENT_ID`                | Yes                        | `twitter-client-id`                                                      | X OAuth 2.0 client ID used to build the authorize URL.            |
| `X_CLIENT_SECRET`            | Yes                        | `twitter-client-secret`                                                  | X confidential client secret used during token exchange.          |
| `X_OAUTH_REDIRECT_URI`       | Yes                        | `https://us-central1-mons-link.cloudfunctions.net/xAuthRedirectCallback` | Must exactly match the callback configured in X Developer Portal. |
| `X_REDIRECT_ALLOWED_ORIGINS` | Yes                        | `https://mons.link,https://www.mons.link,http://localhost:3000`          | Allowlist for safe post-auth return URLs.                         |
| `SIWE_ALLOWED_DOMAINS`       | Yes                        | `mons.link,www.mons.link,staging.mons.link,localhost,127.0.0.1`          | Required for ETH SIWE domain and URI validation.                  |
| `AUTH_DISABLE_APPLE_VERIFY`  | Yes                        | `true` during initial deploy                                             | Kill switch for Apple verify endpoint.                            |
| `AUTH_DISABLE_X_VERIFY`      | Yes                        | `true` during initial deploy                                             | Kill switch for X redirect auth.                                  |
| `AUTH_DISABLE_UNLINK`        | Yes                        | `true` during initial deploy                                             | Kill switch for unlink endpoint.                                  |
| `AUTH_DISABLE_MERGE`         | Yes                        | `true` during initial deploy                                             | Kill switch for cross-profile merge.                              |

Flag values are treated as disabled when set to `1`, `true`, or `yes` (case-insensitive). To enable a feature, set the flag to `false` or remove the key.

### Web app env

Set in `/Users/ivan/Developer/mons/link/.env` or deployment env:

| Key                         | Required | Example        | Notes                                                    |
| --------------------------- | -------- | -------------- | -------------------------------------------------------- |
| `REACT_APP_APPLE_CLIENT_ID` | Yes      | `com.mons.web` | Must match the Apple web Service ID used for `id_token`. |

X does not require a frontend client ID constant. The app asks Functions for the full authorize URL and then redirects.

## Deployment Order

1. Prepare provider configuration.

- In Apple Developer, ensure web Sign in with Apple is configured for your production domain.
- In X Developer Portal, create a confidential OAuth 2.0 app and register the exact callback URL used in `X_OAUTH_REDIRECT_URI`.
- Confirm X scopes are `tweet.read users.read`.

2. Preflight audit with no writes.

- From `/Users/ivan/Developer/mons/link/cloud/admin`:

```bash
gcloud auth application-default login
node preflightAuthAudit.js --project mons-link --out /tmp/auth_preflight_report.json
```

- Block rollout if any of these are non-zero:
  - `duplicateEthCount`
  - `duplicateSolCount`
  - `duplicateAppleCount`
  - `duplicateXCount`
  - `conflictingLoginsCount`
- Investigate `loginProfileLinkMismatchesCount` separately. Active users can self-heal via `syncProfileClaim`.

3. Deploy backend in safe mode.

- Set:
  - `AUTH_DISABLE_APPLE_VERIFY=true`
  - `AUTH_DISABLE_X_VERIFY=true`
  - `AUTH_DISABLE_UNLINK=true`
  - `AUTH_DISABLE_MERGE=true`
- Deploy functions from `/Users/ivan/Developer/mons/link/cloud`:

```bash
firebase deploy --only functions --project mons-link
```

4. Backfill `authMethodIndex`.

- From `/Users/ivan/Developer/mons/link/cloud/admin`:

```bash
node backfillAuthMethodIndex.js --project mons-link --dry-run
node backfillAuthMethodIndex.js --project mons-link
```

- Stop if the script reports ownership conflicts.

5. Re-run the preflight audit.

- Confirm the post-backfill report stays clean:

```bash
node preflightAuthAudit.js --project mons-link --out /tmp/auth_preflight_post_backfill.json
```

6. Enable merge first and keep Apple/X/unlink disabled.

- Set:
  - `AUTH_DISABLE_MERGE=false`
  - `AUTH_DISABLE_APPLE_VERIFY=true`
  - `AUTH_DISABLE_X_VERIFY=true`
  - `AUTH_DISABLE_UNLINK=true`
- Deploy functions.
- Run ETH/SOL sign-in and ETH<->SOL linking canaries only.

7. Deploy the frontend with Apple/X UI.

- Deploy the web app only after backend callables are live.
- Keep Apple and X verification disabled until backend canary looks stable.

8. Enable Apple verification for canary.

- Set:
  - `AUTH_DISABLE_APPLE_VERIFY=false`
  - `AUTH_DISABLE_X_VERIFY=true`
  - `AUTH_DISABLE_UNLINK=true`
  - `AUTH_DISABLE_MERGE=false`
- Deploy functions.
- Run Apple-first and wallet-first link tests.

9. Enable X verification for canary.

- Set:
  - `AUTH_DISABLE_X_VERIFY=false`
  - `AUTH_DISABLE_UNLINK=true`
  - `AUTH_DISABLE_MERGE=false`
- Deploy functions.
- Run X-first and wallet-first link tests.

10. Enable unlink last.

- Set `AUTH_DISABLE_UNLINK=false`.
- Deploy functions.
- Verify the guard still blocks removing the last remaining auth method.

11. Roll out fully.

- Expand from canary to full traffic.
- Keep the Apple/X/unlink/merge kill switches available for rollback.

## Backfill and Data Safety

- Backfill is idempotent and safe to rerun.
- `readProfileByMethod` still has legacy-field fallback, but index backfill is required for consistency and concurrency guarantees.
- Merges are lock-protected via `mergeLocks` and operation-id logged via `authOps`.
- Unlink applies a 24-hour cooldown to:
  - the unlinked method value in `authMethodRevocations`
  - the unlinking profile + method type in `authProfileMethodCooldowns`
- Periodically clean expired cooldown docs:

```bash
cd /Users/ivan/Developer/mons/link/cloud/admin
node cleanupAuthMethodRevocations.js --project mons-link --dry-run
node cleanupAuthMethodRevocations.js --project mons-link
```

## Smoke Tests

Run these end to end after each enablement phase:

1. anon -> Apple sign-in creates one profile and sets `players/{uid}/profile`.
2. anon -> X sign-in creates one profile and sets `players/{uid}/profile`.
3. Apple-first -> add ETH -> both Apple and ETH sign into the same profile.
4. X-first -> add ETH -> both X and ETH sign into the same profile.
5. Apple-first -> add SOL -> both Apple and SOL sign into the same profile.
6. X-first -> add SOL -> both X and SOL sign into the same profile.
7. ETH-first -> add SOL and SOL-first -> add ETH both converge to one profile.
8. Wallet-first -> add Apple does not create a duplicate profile.
9. Wallet-first -> add X does not create a duplicate profile.
10. Unlink is blocked when only one method remains.
11. Unlink succeeds with 2+ methods and writes 24-hour cooldowns for method reuse and same-type relinking.
12. During cooldown, signing in with that recently unlinked method is blocked with `method-reuse-cooldown`.
13. During cooldown, linking another method of that type on the unlinking profile is blocked with `profile-method-cooldown`.
14. Collision merge keeps the current profile as target and applies `rating=min`.
15. Profile remap updates projector output at `users/{profileId}/games`.
16. `syncProfileClaim` restores a missing claim/profile link for an active UID.

## Provider Notes

- Keep Apple and X account linking user-initiated from sign-in or settings flows.
- Do not expose raw Apple `sub` or X `xUserId` values to clients unless required for auth internals.
- X identity is keyed by `xUserId`. `xUsername` is informational metadata and may change without breaking auth.

## Observability

Monitor logs for:

- verify success and failure rate by method
- `merge-method-conflict`
- `merge-lock-active`
- `cannot-remove-last-method`
- `method-reuse-cooldown`
- `profile-method-cooldown`
- `apple-audience-mismatch` / `apple-nonce-mismatch`
- `x-oauth-*` and `x-redirect-*` failures
- index ownership conflicts reported by backfill or audit

Use:

```bash
cd /Users/ivan/Developer/mons/link/cloud
firebase functions:log --project mons-link
```

## Rollback

For immediate stabilization, set and deploy:

- `AUTH_DISABLE_APPLE_VERIFY=true`
- `AUTH_DISABLE_X_VERIFY=true`
- `AUTH_DISABLE_UNLINK=true`
- `AUTH_DISABLE_MERGE=true` when merge is implicated

Then:

1. Keep existing linked-method sign-in operational while Apple/X verification is disabled.
2. Pause rollout expansion.
3. Run `preflightAuthAudit.js` and `backfillAuthMethodIndex.js --dry-run` to identify drift or conflicts.
4. Re-enable features one by one after fixing the root issue.
