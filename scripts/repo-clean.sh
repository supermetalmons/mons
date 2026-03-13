#!/usr/bin/env bash

set -euo pipefail

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$repo_root" ]]; then
  echo "[repo-clean] Not inside a git repository." >&2
  exit 1
fi

cd "$repo_root"

had_errors=0

is_local_kept_branch() {
  local branch="$1"
  case "$branch" in
    main | production | keep/*) return 0 ;;
    *) return 1 ;;
  esac
}

is_remote_kept_branch() {
  local branch="$1"
  case "$branch" in
    main | production | assets | keep/*) return 0 ;;
    *) return 1 ;;
  esac
}

find_remote_branch_by_name() {
  local branch_name="$1"
  local remote_ref

  while IFS= read -r remote_ref; do
    case "$remote_ref" in
      */"$branch_name")
        printf '%s\n' "$remote_ref"
        return 0
        ;;
    esac
  done < <(git for-each-ref --format='%(refname:short)' refs/remotes)

  return 1
}

current_branch="$(git symbolic-ref --quiet --short HEAD || true)"
if [[ -n "$current_branch" ]] && ! is_local_kept_branch "$current_branch"; then
  fallback_branch=""
  for candidate in main production; do
    if git show-ref --verify --quiet "refs/heads/$candidate"; then
      fallback_branch="$candidate"
      break
    fi
  done

  if [[ -z "$fallback_branch" ]]; then
    while IFS= read -r branch; do
      if is_local_kept_branch "$branch"; then
        fallback_branch="$branch"
        break
      fi
    done < <(git for-each-ref --format='%(refname:short)' refs/heads)
  fi

  if [[ -z "$fallback_branch" ]]; then
    fallback_seed_remote=""
    fallback_seed_branch=""
    for candidate in main production; do
      if fallback_seed_remote="$(find_remote_branch_by_name "$candidate")"; then
        fallback_seed_branch="$candidate"
        break
      fi
    done

    if [[ -n "$fallback_seed_remote" ]]; then
      fallback_branch="$fallback_seed_branch"
      echo "[repo-clean] Creating '$fallback_branch' from '$fallback_seed_remote' before cleanup."
      if git switch -c "$fallback_branch" --track "$fallback_seed_remote"; then
        current_branch="$fallback_branch"
      else
        echo "[repo-clean] Could not create/switch to '$fallback_branch' from '$fallback_seed_remote' before cleanup." >&2
        had_errors=1
      fi
    else
      fallback_branch="main"
      echo "[repo-clean] Creating '$fallback_branch' from '$current_branch' before cleanup."
      if git switch -c "$fallback_branch"; then
        current_branch="$fallback_branch"
      else
        echo "[repo-clean] Could not create/switch to '$fallback_branch' before cleanup." >&2
        had_errors=1
      fi
    fi
  else
    echo "[repo-clean] Switching to '$fallback_branch' before branch cleanup."
    if git switch "$fallback_branch"; then
      current_branch="$fallback_branch"
    else
      echo "[repo-clean] Could not create/switch to '$fallback_branch' before cleanup." >&2
      had_errors=1
    fi
  fi
fi

echo "[repo-clean] Removing non-primary worktrees..."
while IFS= read -r line; do
  [[ "$line" == worktree\ * ]] || continue

  worktree_path="${line#worktree }"
  if [[ "$worktree_path" == "$repo_root" ]]; then
    continue
  fi

  echo "  - $worktree_path"
  if ! git worktree remove --force "$worktree_path"; then
    if ! git worktree remove --force --force "$worktree_path"; then
      echo "[repo-clean] Failed to remove worktree '$worktree_path'." >&2
      had_errors=1
    fi
  fi
done < <(git worktree list --porcelain)

git worktree prune --verbose || true

echo "[repo-clean] Clearing stashes..."
if ! git stash clear; then
  echo "[repo-clean] Failed to clear stashes." >&2
  had_errors=1
fi

echo "[repo-clean] Deleting local branches..."
while IFS= read -r branch; do
  [[ -n "$branch" ]] || continue

  if is_local_kept_branch "$branch"; then
    continue
  fi

  if [[ -n "$current_branch" && "$branch" == "$current_branch" ]]; then
    echo "[repo-clean] Skipping current branch '$branch'." >&2
    had_errors=1
    continue
  fi

  echo "  - $branch"
  if ! git branch -D "$branch"; then
    had_errors=1
  fi
done < <(git for-each-ref --format='%(refname:short)' refs/heads)

echo "[repo-clean] Refreshing remotes..."
if ! git fetch --all --prune; then
  echo "[repo-clean] Fetch/prune failed; continuing with locally known remote refs." >&2
fi

echo "[repo-clean] Deleting remote branches..."
while IFS= read -r remote; do
  [[ -n "$remote" ]] || continue

  echo "[repo-clean] Remote '$remote'"
  if remote_heads="$(git ls-remote --heads --refs "$remote" 2>/dev/null)"; then
    while IFS=$'\t' read -r _sha ref; do
      [[ -n "$ref" ]] || continue

      branch="${ref#refs/heads/}"
      [[ "$branch" != "$ref" ]] || continue

      if is_remote_kept_branch "$branch"; then
        continue
      fi

      echo "  - $remote/$branch"
      if ! git push "$remote" --delete "$branch"; then
        had_errors=1
      fi
    done <<< "$remote_heads"
  else
    echo "[repo-clean] Could not list heads for '$remote' via ls-remote; using local tracking refs." >&2
    while IFS= read -r remote_ref; do
      [[ -n "$remote_ref" ]] || continue

      branch="$remote_ref"
      if [[ "$branch" == "HEAD" ]]; then
        continue
      fi

      if is_remote_kept_branch "$branch"; then
        continue
      fi

      echo "  - $remote/$branch"
      if ! git push "$remote" --delete "$branch"; then
        had_errors=1
      fi
    done < <(git for-each-ref --format='%(refname:lstrip=3)' "refs/remotes/$remote")
  fi
done < <(git remote)

if [[ "$had_errors" -ne 0 ]]; then
  echo "[repo-clean] Completed with errors." >&2
  exit 1
fi

echo "[repo-clean] Done."
