param(
    [string]$AndroidSdk = 'D:\andrd',
    [ValidateSet('Development', 'Production')][string]$Mode = 'Development'
)
$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path $PSScriptRoot -Parent
$javaDirectory = Join-Path (Split-Path $projectDirectory -Parent) '.build-tools\java17'
$runtime = Get-ChildItem -LiteralPath $javaDirectory -Directory | Where-Object { Test-Path (Join-Path $_.FullName 'bin\java.exe') } | Select-Object -First 1
if (-not $runtime) { throw 'Install Microsoft OpenJDK 17 under E:\react\.build-tools\java17 first.' }
$previousJava = $env:JAVA_HOME
$previousAndroid = $env:ANDROID_HOME
$previousNode = $env:NODE_ENV
$previousApi = $env:EXPO_PUBLIC_API_BASE_URL
Push-Location $projectDirectory
try {
    $env:JAVA_HOME = $runtime.FullName
    $env:ANDROID_HOME = $AndroidSdk
    $buildMode = $Mode.ToLowerInvariant()
    $env:NODE_ENV = $buildMode
    if ($Mode -eq 'Production') {
        $env:EXPO_PUBLIC_API_BASE_URL = 'https://vaaniapp.co.in/api/v1'
        $credentialsFile = Join-Path $projectDirectory 'credentials.json'
        if (Test-Path $credentialsFile) {
            $credentials = Get-Content -Raw -LiteralPath $credentialsFile | ConvertFrom-Json
            if ($credentials.android -and $credentials.android.keystore) {
                $env:VAANI_KEYSTORE_PASSWORD = $credentials.android.keystore.keystorePassword
                $env:VAANI_KEY_ALIAS = $credentials.android.keystore.keyAlias
                $env:VAANI_KEY_PASSWORD = $credentials.android.keystore.keyPassword
            }
        }
    }
    # Fail before prebuild, version synchronization, or Gradle if Expo resolves an unsafe URL.
    & node .\scripts\android-build-config.cjs $buildMode
    if ($LASTEXITCODE -ne 0) { throw 'Expo build configuration validation failed. Gradle was not started.' }

    # 1. On fresh checkout, generate native android project from tracked app.json if missing
    $androidDir = Join-Path $projectDirectory 'android'
    $gradlew = Join-Path $androidDir 'gradlew.bat'
    $buildGradle = Join-Path $androidDir 'app\build.gradle'

    if (-not (Test-Path $androidDir)) {
        Write-Host "Native Android directory not found. Generating from app.json via expo prebuild..."
        & npx expo prebuild --platform android --no-install
        if ($LASTEXITCODE -ne 0) { throw "expo prebuild failed with exit code $LASTEXITCODE" }
    } elseif ((-not (Test-Path $gradlew)) -or (-not (Test-Path $buildGradle))) {
        throw "Native Android directory '$androidDir' exists but is missing required build files (gradlew.bat or app\build.gradle). Repair or delete the directory before building."
    }

    # 2. Derive and synchronize native version from tracked app.json
    & node .\scripts\sync-android-version.cjs
    if ($LASTEXITCODE -ne 0) { throw "Android version sync failed with exit code $LASTEXITCODE" }

    $gradleTask = if ($Mode -eq 'Production') { 'assembleRelease' } else { 'assembleDebug' }
    & .\android\gradlew.bat -p android $gradleTask -PreactNativeArchitectures=arm64-v8a --max-workers=2 --console=plain
    if ($LASTEXITCODE -ne 0) { throw "Android build failed with exit code $LASTEXITCODE" }
    $artifact = if ($Mode -eq 'Production') { 'release\app-release.apk' } else { 'debug\app-debug.apk' }
    Write-Output (Join-Path $projectDirectory "android\app\build\outputs\apk\$artifact")
} finally {
    $env:JAVA_HOME = $previousJava
    $env:ANDROID_HOME = $previousAndroid
    $env:NODE_ENV = $previousNode
    $env:EXPO_PUBLIC_API_BASE_URL = $previousApi
    $env:VAANI_KEYSTORE_PASSWORD = $null
    $env:VAANI_KEY_ALIAS = $null
    $env:VAANI_KEY_PASSWORD = $null
    Pop-Location
}
