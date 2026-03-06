# X Auth Deployment Runbook

This runbook covers deploying X auth after Google auth has been removed from the project.

## X Developer Portal Setup

1. Create or update your X app as an OAuth 2.0 confidential client.
2. Enable OAuth 2.0 Authorization Code Flow with PKCE.
3. Add the exact callback URL:
   - `https://us-central1-mons-link.cloudfunctions.net/xAuthRedirectCallback`
   - or whatever exact value you set in `X_OAUTH_REDIRECT_URI`
4. Configure the website URL for your production origin.
5. Grant these scopes only:
   - `tweet.read`
   - `users.read`

Identity is keyed by the X user ID returned from `GET /2/users/me`. Username changes do not affect ownership.

## Functions Env

Set these in `cloud/functions/.env.mons-link` or your production secret source:

```bash
APPLE_CLIENT_ID=com.mons.web
APPLE_AUDIENCES=com.mons.web
X_CLIENT_ID=your_x_client_id
X_CLIENT_SECRET=your_x_client_secret
X_OAUTH_REDIRECT_URI=https://us-central1-mons-link.cloudfunctions.net/xAuthRedirectCallback
X_REDIRECT_ALLOWED_ORIGINS=https://mons.link,https://www.mons.link,http://localhost:3000
SIWE_ALLOWED_DOMAINS=mons.link,www.mons.link,localhost,127.0.0.1
AUTH_DISABLE_APPLE_VERIFY=false
AUTH_DISABLE_X_VERIFY=true
AUTH_DISABLE_UNLINK=false
AUTH_DISABLE_MERGE=false
```

Use `AUTH_DISABLE_X_VERIFY=true` for the first safe deploy, then flip it to `false` after canary validation.

## Cleanup Google Functions

After this code change is deployed, use this one-liner to remove the old Google auth functions and redeploy the current set:

```bash
cd /Users/ivan/Developer/mons/link/cloud && firebase functions:delete beginGoogleRedirectAuth completeGoogleRedirectAuth googleAuthRedirectCallback verifyGoogleToken --project mons-link --region us-central1 --force && firebase deploy --only functions --project mons-link
```

If you also need to scrub stored Google auth data, run the admin cleanup script from `/Users/ivan/Developer/mons/link/cloud/admin`:

```bash
node scrubGoogleAuthData.js --project mons-link --out /tmp/google_auth_scrub_report.json
node scrubGoogleAuthData.js --project mons-link --write --force
```

## Deploy Order

1. Deploy Functions with `AUTH_DISABLE_X_VERIFY=true`.
2. Deploy the web app with the new X button enabled.
3. Run X canary sign-in and linking tests.
4. Set `AUTH_DISABLE_X_VERIFY=false`.
5. Deploy Functions again.

## Smoke Tests

Verify all of these in production or canary:

1. Fresh anonymous session -> X sign-in creates a single profile.
2. Existing ETH-only profile -> link X in Settings -> profile is retained.
3. Existing X-only profile -> link ETH and SOL -> methods converge on one profile.
4. Apple-first -> add X -> both methods resolve to the same profile.
5. Wallet-first -> add X does not create a duplicate profile.
6. Unlink shows `X`, succeeds only when another auth method remains, and respects cooldowns.
7. Denied X consent returns to the app with a readable failure and leaves the session intact.

## Rollback

If X auth misbehaves:

1. Set `AUTH_DISABLE_X_VERIFY=true`.
2. Deploy Functions.
3. Leave Apple, ETH, and SOL sign-in enabled.
4. Inspect `firebase functions:log --project mons-link` for `x-oauth-*` and `x-redirect-*` failures.
