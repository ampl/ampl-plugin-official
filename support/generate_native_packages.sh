#!/usr/bin/env bash
set -euox pipefail

# --- Config ---------------------------------------------------------------

# Platforms to build. Override with: PLATFORMS="linux-x64 macos-arm64" ./scripts/build_native_vsix.sh
PLATFORMS="${PLATFORMS:-win-x64 linux-x64 macos-intel64 macos-arm64}"

# JRE zip names at the repo root and their vsce targets.
# Zip files contain a top-level folder of the same base name (e.g., jre-macos-intel64/).
declare -A VSCE_TARGET_FOR=(
  [win-x64]="win32-x64"
  [linux-x64]="linux-x64"
  [macos-intel64]="darwin-x64"
  [macos-arm64]="darwin-arm64"
)

declare -A JRE_PLATFORMS_FOR=(
  [win-x64]="jre-win-x64"
  [linux-x64]="jre-linux-x64"
  [macos-intel64]="jre-macos-x64"
  [macos-arm64]="jre-macos-arm64"
)

# Output folder for produced VSIX files
DIST_DIR="${DIST_DIR:-dist}"

# --- Checks ---------------------------------------------------------------

need() { command -v "$1" >/dev/null 2>&1 || { echo "Error: missing '$1' on PATH" >&2; exit 1; }; }

need unzip
need node
# Use npx vsce (no global install required)
npx --yes vsce --version >/dev/null

# Ensure we’re at the extension root (must have package.json)
[[ -f package.json ]] || { echo "Run this script from the VS Code extension root (package.json not found)"; exit 1; }

# Read extension name & version for nice output names
EXT_NAME="$(node -p "require('./package.json').name")"
EXT_VER="$(node -p "require('./package.json').version")"
mkdir -p "$DIST_DIR"

# Copying jar
mkdir -p libs
cp jres/ampl-ls.jar libs/

# sanity check
[[ -s libs/ampl-ls.jar ]] || { echo "Error: libs/ampl-ls.jar not created or empty"; exit 1; }

# --- 2 & 3) For each platform: unpack JRE -> libs/jre, then package vsix ----

# Clean install: prod-only deps so 'npm list --production' is happy
rm -rf node_modules
if [ ! -f package-lock.json ]; then
  npm install --package-lock-only
fi
npm ci
npm run compile
npm prune --omit=dev

[[ -f out/extension.js ]] || {
  echo "Error: out/extension.js not found after build. Check your build step and package.json:main"; exit 1;
}



for platform in $PLATFORMS; do
  target="${VSCE_TARGET_FOR[$platform]:-}"
  jre_zip="jres/${JRE_PLATFORMS_FOR[$platform]:-}.tar.gz"

  if [[ -z "$target" || -z "$jre_zip" ]]; then
    echo "!! Skipping unknown platform '$platform' (no mapping defined)"
    continue
  fi

  if [[ ! -f "$jre_zip" ]]; then
    echo "!! Skipping $platform: JRE zip '$jre_zip' not found at repo root"
    continue
  fi

  echo ">> Preparing JRE for $platform (zip: $jre_zip -> libs/jre/)..."
  rm -rf libs/jre
  #mkdir -p libs/jre
  rm -rf libs/${JRE_PLATFORMS_FOR[$platform]:-}
  tar -zxf "$jre_zip" -C libs

  mv libs/${JRE_PLATFORMS_FOR[$platform]:-}/ libs/jre
  if [[ "$platform" == linux-* || "$platform" == macos-* ]]; then
  # bin/*
  if [[ -d libs/jre/bin ]]; then
    find libs/jre/bin -type f -exec chmod 0755 {} +
  fi
  # helper launchers some JDKs use
  for f in libs/jre/lib/jspawnhelper libs/jre/lib/jexec; do
    [[ -f "$f" ]] && chmod 0755 "$f"
  done
fi



  # Optional: sanity check that a directory was created under libs/jre
  if ! find libs/jre -mindepth 1 -maxdepth 1 -type d | grep -q .; then
    echo "Error: expected a JRE directory inside '$jre_zip' (e.g., jre-.../)"; exit 1;
  fi

  out_vsix="$DIST_DIR/${EXT_NAME}-${EXT_VER}-${target}.vsix"

  echo ">> Packaging VSIX for $platform (vsce target: $target) -> $out_vsix"
  # Use --out to control the output filename
  npx --yes vsce package --target "$target" --out "$out_vsix"

  # Quick check
  [[ -s "$out_vsix" ]] || { echo "Error: VSIX not produced for $platform"; exit 1; }
done

echo ">> Done. VSIX files in '$DIST_DIR/':"
ls -1 "$DIST_DIR"/*.vsix 2>/dev/null || true
