# mons-cloud-functions

`npm install -g firebase-tools`

`firebase deploy --only functions`

`firebase deploy --only functions:verifyEthAddress`

`firebase auth:export users.json --format=json`

## admin scripts

`gcloud auth application-default login`

`node listAddresses.js`

`node listAddresses.js --project mons-link --out-eth /tmp/eth_addresses.txt --out-sol /tmp/sol_addresses.txt`

`node preflightAuthAudit.js --project mons-link --out /tmp/auth_preflight_report.json`

`node backfillAuthMethodIndex.js --project mons-link --dry-run`

## auth rollout flags

`AUTH_DISABLE_APPLE_VERIFY=true`

`AUTH_DISABLE_UNLINK=true`

`AUTH_DISABLE_MERGE=true`

Detailed rollout sequence and checks: `../docs/auth-rollout.md`
