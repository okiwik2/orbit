# Builds the Android APK.
# Windows breaks native builds on paths over 260 characters, so this mirrors the
# project into a short folder (C:\ob), builds there, and copies orbit.apk back.
$ErrorActionPreference = 'Stop'
$src = Split-Path -Parent $PSScriptRoot
$work = 'C:\ob'

Write-Host "Syncing project to $work ..."
robocopy $src $work /MIR /XD "$src\.git" "$src\android\app\build" "$src\android\build" "$src\android\.gradle" .cxx /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "Copy failed (robocopy $LASTEXITCODE)" }

# Newer CMake ships ninja 1.12, which supports long paths (needs Windows LongPathsEnabled = 1).
$cmake = "$env:LOCALAPPDATA\Android\Sdk\cmake\3.31.6"
if (-not (Test-Path $cmake)) { throw "Install CMake 3.31.6: sdkmanager `"cmake;3.31.6`"" }
$lp = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem').LongPathsEnabled
if ($lp -ne 1) { throw 'Windows long paths are off. See README (Android build) to switch them on.' }
Set-Content "$work\android\local.properties" ("cmake.dir=" + ($cmake -replace '\\', '\\' -replace ':', '\:'))

Push-Location "$work\android"
try {
  .\gradlew.bat assembleRelease --no-daemon "-PreactNativeArchitectures=arm64-v8a,armeabi-v7a"
  if ($LASTEXITCODE -ne 0) { throw 'Gradle build failed' }
} finally { Pop-Location }

Copy-Item "$work\android\app\build\outputs\apk\release\app-release.apk" "$src\orbit.apk" -Force
Write-Host "Done: $src\orbit.apk"
