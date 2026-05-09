#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

VERSION=""
REF="HEAD"
REMOTE="origin"
WORKFLOW="release.yml"
DELETE_ASSETS=0
YES=0
WATCH=0

usage() {
  cat <<'USAGE'
Usage: scripts/republish-draft-release.sh <version> [options]

Re-point an unpublished draft release tag to a fixed commit and rerun the
Release workflow. The script refuses to touch a release that has already been
published.

Options:
  --ref <git-ref>       Commit/ref to publish. Defaults to HEAD.
  --remote <name>       Git remote to push the tag to. Defaults to origin.
  --delete-assets       Delete existing draft assets before rerunning.
  --yes                 Skip the confirmation prompt.
  --watch               Watch the triggered workflow run when possible.
  --help                Show this help.

Examples:
  scripts/republish-draft-release.sh 0.5.7
  scripts/republish-draft-release.sh 0.5.7 --delete-assets --watch
  scripts/republish-draft-release.sh 0.5.7 --ref main --yes
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ref)
      if [[ $# -lt 2 || -z "${2:-}" ]]; then
        echo "--ref requires a value" >&2
        exit 2
      fi
      REF="${2:-}"
      shift 2
      ;;
    --remote)
      if [[ $# -lt 2 || -z "${2:-}" ]]; then
        echo "--remote requires a value" >&2
        exit 2
      fi
      REMOTE="${2:-}"
      shift 2
      ;;
    --delete-assets)
      DELETE_ASSETS=1
      shift
      ;;
    --yes|-y)
      YES=1
      shift
      ;;
    --watch)
      WATCH=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    --*)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
    *)
      if [[ -n "$VERSION" ]]; then
        echo "Unexpected extra argument: $1" >&2
        usage >&2
        exit 2
      fi
      VERSION="$1"
      shift
      ;;
  esac
done

if [[ -z "$VERSION" ]]; then
  usage >&2
  exit 2
fi

if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(\.[0-9]+)?$ ]]; then
  echo "Invalid version: $VERSION" >&2
  echo "Expected a numeric version like 0.5.7 or 0.5.7.1." >&2
  exit 2
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI is not installed or not on PATH: gh" >&2
  exit 127
fi

if [[ ! -f package.json ]]; then
  echo "package.json not found. Run this script from the repository root." >&2
  exit 1
fi

PACKAGE_VERSION="$(node -p "require('./package.json').version")"
if [[ "$PACKAGE_VERSION" != "$VERSION" ]]; then
  echo "package.json version is $PACKAGE_VERSION, but requested release is $VERSION." >&2
  echo "Use npm run release for a new version, or check out the matching release commit." >&2
  exit 1
fi

STATUS="$(git status --short)"
if [[ -n "$STATUS" ]]; then
  echo "Working tree is not clean. Commit or stash changes before republishing:" >&2
  echo "$STATUS" >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "GitHub CLI is not authenticated. Run: gh auth login" >&2
  exit 1
fi

TARGET_SHA="$(git rev-parse --verify "$REF^{commit}")"
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"

git fetch "$REMOTE" --tags --quiet

REMOTE_TAG_TARGET_SHA=""
TAG_LOOKUP_FILE="$(mktemp "${TMPDIR:-/tmp}/shiguang-release-tag.XXXXXX")"
if git ls-remote --exit-code --tags "$REMOTE" "refs/tags/$VERSION" "refs/tags/$VERSION^{}" >"$TAG_LOOKUP_FILE" 2>/dev/null; then
  REMOTE_TAG_TARGET_SHA="$(
    awk '
      NR == 1 { first = $1 }
      /\^\{\}$/ { peeled = $1 }
      END { print peeled ? peeled : first }
    ' "$TAG_LOOKUP_FILE"
  )"
fi
rm -f "$TAG_LOOKUP_FILE"

RELEASE_EXISTS=0
RELEASE_JSON=""
if RELEASE_JSON="$(gh release view "$VERSION" --json isDraft,url,assets 2>/dev/null)"; then
  RELEASE_EXISTS=1
  IS_DRAFT="$(printf '%s' "$RELEASE_JSON" | node -e "let data=''; process.stdin.on('data', c => data += c); process.stdin.on('end', () => console.log(JSON.parse(data).isDraft ? 'true' : 'false'));")"
  if [[ "$IS_DRAFT" != "true" ]]; then
    echo "Release $VERSION already exists and is not a draft. Refusing to republish it." >&2
    exit 1
  fi
fi

echo "Draft release republish plan:"
echo "- version: $VERSION"
echo "- target ref: $REF"
echo "- target commit: $TARGET_SHA"
echo "- remote: $REMOTE"
if [[ -n "$REMOTE_TAG_TARGET_SHA" ]]; then
  echo "- remote tag refs/tags/$VERSION target: $REMOTE_TAG_TARGET_SHA"
else
  echo "- remote tag refs/tags/$VERSION: not found"
fi
if [[ "$RELEASE_EXISTS" -eq 1 ]]; then
  RELEASE_URL="$(printf '%s' "$RELEASE_JSON" | node -e "let data=''; process.stdin.on('data', c => data += c); process.stdin.on('end', () => console.log(JSON.parse(data).url));")"
  ASSET_COUNT="$(printf '%s' "$RELEASE_JSON" | node -e "let data=''; process.stdin.on('data', c => data += c); process.stdin.on('end', () => console.log(JSON.parse(data).assets.length));")"
  echo "- draft release: $RELEASE_URL"
  echo "- existing draft assets: $ASSET_COUNT"
else
  echo "- draft release: not found; the workflow will create it"
fi
if [[ "$DELETE_ASSETS" -eq 1 ]]; then
  echo "- delete existing draft assets: yes"
fi

if [[ "$YES" -ne 1 ]]; then
  echo
  read -r -p "Continue and republish draft release $VERSION? [y/N] " answer
  case "$answer" in
    y|Y|yes|YES)
      ;;
    *)
      echo "Aborted."
      exit 1
      ;;
  esac
fi

if [[ "$DELETE_ASSETS" -eq 1 && "$RELEASE_EXISTS" -eq 1 ]]; then
  while IFS= read -r asset; do
    [[ -z "$asset" ]] && continue
    echo "Deleting draft asset: $asset"
    gh release delete-asset "$VERSION" "$asset" --yes
  done < <(printf '%s' "$RELEASE_JSON" | node -e "let data=''; process.stdin.on('data', c => data += c); process.stdin.on('end', () => JSON.parse(data).assets.forEach(asset => console.log(asset.name)));")
fi

git tag -f -a "$VERSION" "$TARGET_SHA" -m "$VERSION" >/dev/null

if [[ "$REMOTE_TAG_TARGET_SHA" != "$TARGET_SHA" ]]; then
  echo "Pushing tag $VERSION to $REMOTE. The tag push should trigger the Release workflow."
  git push "$REMOTE" "refs/tags/$VERSION:refs/tags/$VERSION" --force
  TRIGGERED_BY="tag-push"
else
  echo "Remote tag already points at $TARGET_SHA. Dispatching the Release workflow manually."
  gh workflow run "$WORKFLOW" --ref "$VERSION" -f "version=$VERSION"
  TRIGGERED_BY="workflow-dispatch"
fi

echo "Release workflow trigger: $TRIGGERED_BY"

if [[ "$WATCH" -eq 1 ]]; then
  echo "Waiting for the workflow run to appear..."
  sleep 5
  RUN_ID="$(gh run list --workflow "$WORKFLOW" --limit 10 --json databaseId,headSha,event,createdAt \
    --jq ".[] | select(.headSha == \"$TARGET_SHA\") | .databaseId" | head -n 1)"
  if [[ -n "$RUN_ID" ]]; then
    gh run watch "$RUN_ID"
  else
    echo "Could not find the new run yet. Check it with: gh run list --workflow $WORKFLOW" >&2
  fi
fi

echo "Done. Check release runs with: gh run list --workflow $WORKFLOW"
echo "Current branch: $CURRENT_BRANCH"
