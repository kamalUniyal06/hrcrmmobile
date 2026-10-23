# Build the debug app, install it on the connected emulator / device and launch it.
# Start Metro first in another terminal:  npm run start:fresh
# Usage:  .\scripts\run-android.ps1            (only the connected device's ABI, fastest)
#         .\scripts\run-android.ps1 -AllAbis   (all four ABIs)
param([switch]$AllAbis)

. "$PSScriptRoot\android-env.ps1"

$device = (& adb devices | Select-String -Pattern "`tdevice$" | Select-Object -First 1)
if (-not $device) { Write-Error "No emulator or device is connected (adb devices)."; exit 1 }

$gradleArgs = @("app:installDebug", "-PreactNativeDevServerPort=8081")
if (-not $AllAbis) {
  $abi = (& adb shell getprop ro.product.cpu.abi).Trim()
  if ($abi) { $gradleArgs += "-PreactNativeArchitectures=$abi" }
}

Push-Location "$PSScriptRoot\..\android"
try {
  & .\gradlew.bat @gradleArgs
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
  Pop-Location
}

& adb reverse tcp:8081 tcp:8081 | Out-Null
& adb shell am start -n ai.hrcrm.app/.MainActivity | Out-Null
Write-Host "HRCRM launched. Metro must be running on port 8081."
