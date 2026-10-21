# Dot-source this before Gradle / react-native commands on a machine where the
# JDK and Android SDK are not on PATH:   . .\scripts\android-env.ps1
# Override with environment variables if your tools live elsewhere.

if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk" }
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME

if (-not $env:JAVA_HOME) {
  $jdk = Get-ChildItem "$env:USERPROFILE\.jdks" -Directory -Filter "jdk-17*" -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($jdk) { $env:JAVA_HOME = $jdk.FullName }
}

$extra = @(
  "$env:JAVA_HOME\bin",
  "$env:ANDROID_HOME\platform-tools",
  "$env:ANDROID_HOME\emulator",
  "$env:ANDROID_HOME\cmdline-tools\latest\bin"
) | Where-Object { $_ -and (Test-Path $_) }

foreach ($dir in $extra) {
  if (-not (($env:PATH -split ';') -contains $dir)) { $env:PATH = "$dir;$env:PATH" }
}

Write-Host "JAVA_HOME=$env:JAVA_HOME"
Write-Host "ANDROID_HOME=$env:ANDROID_HOME"
