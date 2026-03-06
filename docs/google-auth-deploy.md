# Google Auth Deployment Runbook (Prod Already Live with ETH/SOL/Apple)

This runbook is for incremental rollout of **Google sign-in** when production already has:

- ETH sign-in live
- SOL sign-in live
- Apple sign-in live
- Existing profile linking/merge/unlink behavior live

Use this when you only want to add Google as another linked auth method with minimal risk.

## 1. Preconditions

1. Confirm Google OAuth web client is configured in Google Cloud Console.
2. Confirm your production domain(s) are added to authorized JavaScript origins.
3. Confirm the client ID you will use is a **Web application** OAuth client ID.
4. Confirm you can deploy both Functions and Web app to production.

## 2. Required Environment Variables

Set these values before deployment.

### Cloud Functions env (`cloud/functions/.env.<project-id>`)

Set either:

- `GOOGLE_CLIENT_ID=<prod_web_client_id>`

or:

- `GOOGLE_AUDIENCES=<comma-separated-allowed-client-ids>`

Also set rollout kill switch:

- `AUTH_DISABLE_GOOGLE_VERIFY=true`

Keep your existing flags (`AUTH_DISABLE_APPLE_VERIFY`, `AUTH_DISABLE_UNLINK`, `AUTH_DISABLE_MERGE`) at their current production values unless you intentionally want to change them.

### Web app client ID (hardcoded placeholder)

- Edit `/Users/ivan/Developer/mons/link/src/connection/googleConnection.ts` and set:
  - `GOOGLE_CLIENT_ID` to your production Google web client ID.
- Default placeholder:
  - `REPLACE_WITH_YOUR_GOOGLE_WEB_CLIENT_ID.apps.googleusercontent.com`

## 3. Deploy in Safe Mode (Google verify disabled)

1. Deploy Functions with Google code + `AUTH_DISABLE_GOOGLE_VERIFY=true`.
2. Deploy Web app with Google UI after filling `GOOGLE_CLIENT_ID` placeholder in `src/connection/googleConnection.ts`.

Commands:

```bash
cd /Users/ivan/Developer/mons/link/cloud
firebase deploy --only functions --project mons-link
```

Deploy frontend with your normal production web deploy command after the placeholder is filled.

## 4. Optional Data Safety Check (Recommended)

Run these once before enabling Google verify:

```bash
cd /Users/ivan/Developer/mons/link/cloud/admin
gcloud auth application-default login
node preflightAuthAudit.js --project mons-link --out /tmp/auth_pre_google_enable.json
node backfillAuthMethodIndex.js --project mons-link --dry-run
```

If `conflictingLoginsCount` or duplicate ownership counts are non-zero, resolve before broad rollout.

## 5. Enable Google Verification

1. Change Functions env:
   - `AUTH_DISABLE_GOOGLE_VERIFY=false`
2. Deploy Functions again.

```bash
cd /Users/ivan/Developer/mons/link/cloud
firebase deploy --only functions --project mons-link
```

## 6. Canary Validation (Must Pass Before Full Rollout)

Run these with real canary accounts/devices:

1. Fresh anonymous session -> Google sign-in creates profile and signs in successfully.
2. Existing ETH-only profile -> link Google in Settings -> same profile is retained.
3. Existing Google-only profile -> link ETH and SOL -> methods converge on one profile.
4. Sign In popover Google button works on desktop.
5. Sign In popover Google button works on mobile.
6. Settings Modal Google connect works on desktop.
7. Settings Modal Google connect works on mobile.
8. Cooldown errors render readable method labels (`Google`) when applicable.
9. Existing ETH/SOL/Apple flows still work unchanged.

## 7. Production Ramp

1. Keep rollout to canary cohort first.
2. Monitor logs for 15-30 minutes.
3. Ramp to full traffic after clean canary window.

Log command:

```bash
cd /Users/ivan/Developer/mons/link/cloud
firebase functions:log --project mons-link
```

Watch for:

- `google-token-invalid`
- `google-audience-mismatch`
- `google-nonce-mismatch`
- `method-reuse-cooldown`
- `profile-method-cooldown`

## 8. Fast Rollback

If Google sign-in misbehaves, disable only Google verification:

1. Set `AUTH_DISABLE_GOOGLE_VERIFY=true`
2. Deploy Functions

```bash
cd /Users/ivan/Developer/mons/link/cloud
firebase deploy --only functions --project mons-link
```

This keeps ETH/SOL/Apple flows operating while Google verify is paused.

## 9. Post-Rollout Checklist

1. Keep `GOOGLE_CLIENT_ID`/`GOOGLE_AUDIENCES` documented in your prod env inventory.
2. Keep `AUTH_DISABLE_GOOGLE_VERIFY` available as an emergency kill switch.
3. Add Google checks to your regular auth smoke/regression checklist.
