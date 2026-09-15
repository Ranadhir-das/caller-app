param([string]$AndroidSdk = 'D:\andrd')
$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path $PSScriptRoot -Parent
$javaDirectory = Join-Path (Split-Path $projectDirectory -Parent) '.build-tools\java17'
$runtime = Get-ChildItem -LiteralPath $javaDirectory -Directory | Where-Object { Test-Path (Join-Path $_.FullName 'bin\java.exe') } | Select-Object -First 1
if (-not $runtime) { throw 'Install Microsoft OpenJDK 17 under E:\react\.build-tools\java17 first.' }
$previousJava = $env:JAVA_HOME
$previousAndroid = $env:ANDROID_HOME
$previousNode = $env:NODE_ENV
Push-Location $projectDirectory
try {
    $env:JAVA_HOME = $runtime.FullName
    $env:ANDROID_HOME = $AndroidSdk
    $env:NODE_ENV = 'development'
    & .\android\gradlew.bat -p android assembleDebug -PreactNativeArchitectures=arm64-v8a --max-workers=2 --console=plain
    if ($LASTEXITCODE -ne 0) { throw "Android build failed with exit code $LASTEXITCODE" }
    Write-Output (Join-Path $projectDirectory 'android\app\build\outputs\apk\debug\app-debug.apk')
} finally {
    $env:JAVA_HOME = $previousJava
    $env:ANDROID_HOME = $previousAndroid
    $env:NODE_ENV = $previousNode
    Pop-Location
}
