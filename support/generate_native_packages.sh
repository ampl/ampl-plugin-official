#!/usr/bin/env bash
set -euox pipefail

# --- Config ---------------------------------------------------------------

# Platforms to build. Override with: PLATFORMS="linux-x64 macos-arm64" ./scripts/build_native_vsix.sh
PLATFORMS="${PLATFORMS:-win-x64 linux-x64 macos-x64 macos-arm64}"

# vsce packaging targets for each platform.
declare -A VSCE_TARGET_FOR=(
  [win-x64]="win32-x64"
  [linux-x64]="linux-x64"
  [macos-x64]="darwin-x64"
  [macos-arm64]="darwin-arm64"
)

# Native ampl-lsp binary tarballs at the repo root (native-binaries/bin-<platform>.tar.gz),
# produced by the amplls pipeline. Each tarball contains a top-level
# bin-<platform>/ folder with the ampl-lsp(.exe) executable inside.
declare -A BIN_ARCHIVE_FOR=(
  [win-x64]="bin-win-x64"
  [linux-x64]="bin-linux-x64"
  [macos-x64]="bin-macos-x64"
  [macos-arm64]="bin-macos-arm64"
)

# Output folder for produced VSIX files
DIST_DIR="${DIST_DIR:-dist}"

# --- Checks ---------------------------------------------------------------

need() { command -v "$1" >/dev/null 2>&1 || { echo "Error: missing '$1' on PATH" >&2; exit 1; }; }

need tar
need node
# Use npx vsce (no global install required)
npx --yes vsce --version >/dev/null

# Ensure we’re at the extension root (must have package.json)
[[ -f package.json ]] || { echo "Run this script from the VS Code extension root (package.json not found)"; exit 1; }

# Read extension name & version for nice output names
EXT_NAME="$(node -p "require('./package.json').name")"
EXT_VER="$(node -p "require('./package.json').version")"
mkdir -p "$DIST_DIR" libs

# --- Build the extension ---------------------------------------------------

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


# --- Fallback generic VSIX (static Java jar, NO VERSION IN FILENAME) ------
# libs/ampl-ls.jar is a static, checked-in build of the (no longer actively
# developed) Java language server. It ships only in this generic package, as
# the language server for platforms without a native ampl-lsp build; it
# requires a Java runtime (11+) on JAVA_HOME or PATH at runtime.
rm -f libs/ampl-lsp libs/ampl-lsp.exe  # ensure no platform-specific binary included
[[ -s libs/ampl-ls.jar ]] || { echo "Error: libs/ampl-ls.jar (static fallback) not found or empty"; exit 1; }
FALLBACK_VSIX="$DIST_DIR/${EXT_NAME}-${EXT_VER}.vsix"
echo ">> Packaging fallback VSIX (Java jar, no version) -> $FALLBACK_VSIX"
npx --yes vsce package --out "$FALLBACK_VSIX"
[[ -s "$FALLBACK_VSIX" ]] || { echo "Error: fallback VSIX not produced"; exit 1; }


# Platform-specific VSIXs bundle only the native binary; the static Java jar
# fallback is left out since the native build covers that platform.
[[ -f libs/ampl-ls.jar ]] && mv libs/ampl-ls.jar libs/ampl-ls.jar.bak

for platform in $PLATFORMS; do
  target="${VSCE_TARGET_FOR[$platform]:-}"
  outdir="${BIN_ARCHIVE_FOR[$platform]:-}"
  bin_archive="native-binaries/${outdir}.tar.gz"

  if [[ -z "$target" || -z "$outdir" ]]; then
    echo "!! Skipping unknown platform '$platform' (no mapping defined)"
    continue
  fi

  if [[ ! -f "$bin_archive" ]]; then
    echo "!! Skipping $platform: binary archive '$bin_archive' not found at repo root"
    continue
  fi

  exe_name="ampl-lsp"
  [[ "$platform" == win-* ]] && exe_name="ampl-lsp.exe"

  echo ">> Preparing ampl-lsp for $platform (archive: $bin_archive -> libs/$exe_name)..."
  rm -rf "libs/${outdir}" "libs/$exe_name"
  tar -zxf "$bin_archive" -C libs
  mv "libs/${outdir}/${exe_name}" "libs/${exe_name}"
  rm -rf "libs/${outdir}"

  if [[ "$platform" != win-* ]]; then
    chmod 0755 "libs/${exe_name}"
  fi

  [[ -s "libs/${exe_name}" ]] || { echo "Error: expected 'libs/${exe_name}' after unpacking '$bin_archive'"; exit 1; }

  out_vsix="$DIST_DIR/${EXT_NAME}-${EXT_VER}-${target}.vsix"

  echo ">> Packaging VSIX for $platform (vsce target: $target) -> $out_vsix"
  # Use --out to control the output filename
  npx --yes vsce package --target "$target" --out "$out_vsix"

  # Quick check
  [[ -s "$out_vsix" ]] || { echo "Error: VSIX not produced for $platform"; exit 1; }

  rm -f "libs/${exe_name}"
done

[[ -f libs/ampl-ls.jar.bak ]] && mv libs/ampl-ls.jar.bak libs/ampl-ls.jar

echo ">> Done. VSIX files in '$DIST_DIR/':"
ls -1 "$DIST_DIR"/*.vsix 2>/dev/null || true
