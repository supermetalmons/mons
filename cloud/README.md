# mons cloud operations

Run all commands from the repository root.

## Setup

`npm install -g firebase-tools`

## Live Firebase operations

These commands deploy functions or export live authentication data.

`firebase deploy --config cloud/firebase.json --project mons-link --only functions`

`npm --prefix cloud/functions run deploy:safe -- --project mons-link`

`firebase deploy --config cloud/firebase.json --project mons-link --only functions:verifyEthAddress`

`npm --prefix cloud/functions run deploy:safe -- --project mons-link --batch-size 5`

`AUTH_EXPORT_PATH="$(mktemp)" && firebase auth:export "$AUTH_EXPORT_PATH" --config cloud/firebase.json --project mons-link --format=json && echo "Exported to $AUTH_EXPORT_PATH"`

## Admin address listing

Authenticate with Application Default Credentials before running the address commands:

`gcloud auth application-default login`

`npm --prefix cloud/admin start`

`npm --prefix cloud/admin start -- --project mons-link --out-eth /tmp/eth_addresses.txt --out-sol /tmp/sol_addresses.txt`

## Auth rollout configuration

These are configuration values, not standalone shell commands.

`AUTH_DISABLE_APPLE_VERIFY=true`

`AUTH_DISABLE_X_VERIFY=true`

`AUTH_DISABLE_UNLINK=true`

`AUTH_DISABLE_MERGE=true`
