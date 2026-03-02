#!/usr/bin/env bash

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
CLOUD_DIR="${ROOT_DIR}/cloud"

PROJECT="${FIREBASE_PROJECT:-mons-link}"
RETRIES="${DEPLOY_RETRIES:-3}"
RETRY_DELAY_SEC="${DEPLOY_RETRY_DELAY_SEC:-45}"
BETWEEN_DEPLOYS_DELAY_SEC="${DEPLOY_BETWEEN_DELAY_SEC:-8}"

print_usage() {
  cat <<EOF
Usage:
  $(basename "$0") [functionName ...]

Behavior:
  - Deploys functions one by one from ${CLOUD_DIR}
  - Retries failed deploys up to ${RETRIES} times
  - If no function names are passed, deploys all current exported functions

Environment overrides:
  FIREBASE_PROJECT=<project-id>          (default: ${PROJECT})
  DEPLOY_RETRIES=<n>                     (default: ${RETRIES})
  DEPLOY_RETRY_DELAY_SEC=<seconds>       (default: ${RETRY_DELAY_SEC})
  DEPLOY_BETWEEN_DELAY_SEC=<seconds>     (default: ${BETWEEN_DEPLOYS_DELAY_SEC})

Examples:
  $(basename "$0")
  $(basename "$0") beginAuthIntent verifyAppleToken verifyEthAddress
  FIREBASE_PROJECT=mons-link $(basename "$0") verifyAppleToken
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  print_usage
  exit 0
fi

if ! command -v firebase >/dev/null 2>&1; then
  echo "ERROR: firebase CLI is not installed or not in PATH."
  exit 1
fi

if [[ ! -d "${CLOUD_DIR}" ]]; then
  echo "ERROR: Could not find cloud directory at ${CLOUD_DIR}."
  exit 1
fi

declare -a functions
if [[ "$#" -gt 0 ]]; then
  functions=("$@")
else
  functions=(
    verifySolanaAddress
    verifyEthAddress
    beginAuthIntent
    verifyAppleToken
    unlinkAuthMethod
    getLinkedAuthMethods
    syncProfileClaim
    startMatchTimer
    claimMatchVictoryByTimer
    automatch
    cancelAutomatch
    removeNavigationGame
    updateRatings
    editUsername
    getNfts
    mineRock
    sendWagerProposal
    cancelWagerProposal
    declineWagerProposal
    acceptWagerProposal
    resolveWagerOutcome
    projectProfileGamesOnInviteCreated
    projectProfileGamesOnInviteGuestIdChanged
    projectProfileGamesOnInviteHostRematchesChanged
    projectProfileGamesOnInviteGuestRematchesChanged
    projectProfileGamesOnMatchCreated
    projectProfileGamesOnAutomatchQueueWritten
    projectProfileGamesOnProfileLinkCreated
    projectProfileGamesOnProfileLinkWritten
    projectProfileGamesOnProfileDeleted
  )
fi

deploy_one() {
  local function_name="$1"
  local attempt=1
  while [[ "${attempt}" -le "${RETRIES}" ]]; do
    echo
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Deploying ${function_name} (attempt ${attempt}/${RETRIES})"
    if (cd "${CLOUD_DIR}" && firebase deploy --only "functions:${function_name}" --project "${PROJECT}"); then
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] SUCCESS ${function_name}"
      return 0
    fi

    if [[ "${attempt}" -lt "${RETRIES}" ]]; then
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] RETRY ${function_name} in ${RETRY_DELAY_SEC}s"
      sleep "${RETRY_DELAY_SEC}"
    fi
    attempt=$((attempt + 1))
  done

  echo "[$(date '+%Y-%m-%d %H:%M:%S')] FAILED ${function_name} after ${RETRIES} attempts"
  return 1
}

echo "Project: ${PROJECT}"
echo "Cloud dir: ${CLOUD_DIR}"
echo "Functions to deploy: ${#functions[@]}"
echo "Retries per function: ${RETRIES}"
echo "Retry delay: ${RETRY_DELAY_SEC}s"
echo "Between deploy delay: ${BETWEEN_DEPLOYS_DELAY_SEC}s"

declare -a failures
declare -a successes

for i in "${!functions[@]}"; do
  function_name="${functions[$i]}"
  if deploy_one "${function_name}"; then
    successes+=("${function_name}")
  else
    failures+=("${function_name}")
  fi

  is_last=$((i + 1 == ${#functions[@]}))
  if [[ "${is_last}" -eq 0 ]]; then
    sleep "${BETWEEN_DEPLOYS_DELAY_SEC}"
  fi
done

echo
echo "===== Deployment Summary ====="
echo "Successful (${#successes[@]}): ${successes[*]:-none}"
echo "Failed (${#failures[@]}): ${failures[*]:-none}"

if [[ "${#failures[@]}" -gt 0 ]]; then
  exit 1
fi

exit 0
