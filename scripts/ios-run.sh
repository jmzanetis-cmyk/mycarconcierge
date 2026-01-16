#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IOS_DIR="$PROJECT_ROOT/ios/App"
SIM_NAME="${SIMULATOR_NAME:-}"
if [[ -z "$SIM_NAME" ]]; then
  SIM_NAME="$(
    python3 - <<'PY'
import json, subprocess, re

data = json.loads(subprocess.check_output(["xcrun", "simctl", "list", "devices", "available", "-j"]))
devices = data.get("devices", {})

def runtime_version(runtime):
    m = re.search(r"iOS-(\d+)-(\d+)", runtime)
    if not m:
        return (0, 0)
    return (int(m.group(1)), int(m.group(2)))

def device_rank(name):
    if name.startswith("iPhone "):
        tail = name.replace("iPhone ", "")
        nums = re.findall(r"\d+", tail)
        major = int(nums[0]) if nums else 0
        bonus = 1 if "Pro Max" in tail else 0
        bonus = 2 if "Pro" in tail else bonus
        return (major, bonus, tail)
    return (0, 0, name)

best = None
for runtime, sims in devices.items():
    rv = runtime_version(runtime)
    for sim in sims:
        name = sim.get("name", "")
        if not name.startswith("iPhone "):
            continue
        if sim.get("isAvailable") is not True:
            continue
        rank = (rv, device_rank(name))
        if best is None or rank > best[0]:
            best = (rank, name)

print(best[1] if best else "iPhone 17")
PY
  )"
fi

DESTINATION="platform=iOS Simulator,name=${SIM_NAME}"
APP_ID="co.mycarconcierge.app"

cd "$PROJECT_ROOT"
npm run build:www
npx cap sync ios

cd "$IOS_DIR"
xcodebuild -workspace App.xcworkspace -scheme App -configuration Debug -destination "$DESTINATION" build

BUILT_PRODUCTS_DIR="$(
  xcodebuild -workspace App.xcworkspace -scheme App -configuration Debug -destination "$DESTINATION" -showBuildSettings \
    | awk -F ' = ' '/BUILT_PRODUCTS_DIR/ {print $2; exit}'
)"
APP_PATH="${BUILT_PRODUCTS_DIR}/App.app"

UDID="$(
  SIM_NAME="$SIM_NAME" python3 - <<'PY'
import json, os, subprocess
data = json.loads(subprocess.check_output(["xcrun", "simctl", "list", "devices", "available", "-j"]))
devices = data.get("devices", {})
name = os.environ.get("SIM_NAME", "")
for sims in devices.values():
    for sim in sims:
        if sim.get("name") == name and sim.get("isAvailable") is True:
            print(sim.get("udid", ""))
            raise SystemExit(0)
print("")
PY
)"

if [[ -z "$UDID" ]]; then
  echo "Simulator not found: ${SIM_NAME}"
  exit 1
fi

xcrun simctl boot "$UDID" || true
open -a Simulator
xcrun simctl install "$UDID" "$APP_PATH"
xcrun simctl launch "$UDID" "$APP_ID"
