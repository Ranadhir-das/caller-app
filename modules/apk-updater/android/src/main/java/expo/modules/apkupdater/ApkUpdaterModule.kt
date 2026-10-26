package expo.modules.apkupdater

import android.content.ClipData
import android.content.Intent
import android.content.pm.PackageInfo
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.functions.Queues
import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest

class ApkFileProvider : FileProvider()

class ApkUpdaterModule : Module() {
  private fun context() = appContext.reactContext ?: error("Vaani is not ready. Try again.")
  @Suppress("DEPRECATION")
  private fun code(info: PackageInfo): Long = if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else info.versionCode.toLong()

  private fun calculateSha256(file: File): String {
    val digest = MessageDigest.getInstance("SHA-256")
    FileInputStream(file).use { fis ->
      val buffer = ByteArray(16384)
      var bytesRead: Int
      while (fis.read(buffer).also { bytesRead = it } != -1) {
        digest.update(buffer, 0, bytesRead)
      }
    }
    return digest.digest().joinToString("") { "%02x".format(it) }
  }

  private fun validate(uri: String, expectedCode: Double, expectedSha256: String? = null): File {
    val ctx = context()
    val parsed = Uri.parse(uri)
    require(parsed.scheme == "file") { "Invalid APK location." }
    val file = File(parsed.path ?: "").canonicalFile
    val directory = File(ctx.cacheDir, "apk-updates").canonicalFile
    require(file.parentFile == directory && file.name in listOf("vaani-latest.apk", "vaani-latest.part.apk")) { "APK must be in the private update cache." }
    require(file.isFile && file.length() > 0) { "Downloaded APK is missing or empty. Download again." }
    val pm = ctx.packageManager
    @Suppress("DEPRECATION")
    val archive = pm.getPackageArchiveInfo(file.path, 0) ?: error("The download is not a valid APK.")
    @Suppress("DEPRECATION")
    val installed = pm.getPackageInfo(ctx.packageName, 0)
    require(archive.packageName == ctx.packageName) { "This APK belongs to a different app." }
    require(code(archive).toDouble() == expectedCode && code(archive) > code(installed)) { "APK version does not match this update. Check again or contact your administrator." }
    if (!expectedSha256.isNullOrBlank()) {
      val actualSha = calculateSha256(file)
      require(actualSha.equals(expectedSha256.trim(), ignoreCase = true)) {
        "Downloaded APK checksum verification failed. Expected $expectedSha256 but got $actualSha."
      }
    }
    return file
  }

  override fun definition() = ModuleDefinition {
    Name("ApkUpdater")
    AsyncFunction("getInstalledAppInfo") {
      val ctx = context()
      @Suppress("DEPRECATION")
      val info = ctx.packageManager.getPackageInfo(ctx.packageName, 0)
      mapOf("version" to (info.versionName ?: "Unknown"), "versionCode" to code(info).toDouble(), "packageName" to ctx.packageName)
    }
    AsyncFunction("validateApk") { uri: String, expectedCode: Double, expectedSha256: String? ->
      validate(uri, expectedCode, expectedSha256)
      true
    }
    AsyncFunction("getApkSha256") { uri: String ->
      val parsed = Uri.parse(uri)
      val file = File(parsed.path ?: "").canonicalFile
      calculateSha256(file)
    }
    AsyncFunction("openInstallSettings") {
      val activity = appContext.currentActivity ?: error("Open Vaani before changing install permission.")
      if (Build.VERSION.SDK_INT >= 26) {
        activity.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${activity.packageName}")))
      }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("installApk") { uri: String, expectedCode: Double, expectedSha256: String? ->
      val activity = appContext.currentActivity ?: error("Open Vaani before installing the update.")
      val file = validate(uri, expectedCode, expectedSha256)
      if (Build.VERSION.SDK_INT >= 26 && !activity.packageManager.canRequestPackageInstalls()) {
        "permission_required"
      } else {
        val content = FileProvider.getUriForFile(activity, "${activity.packageName}.apkupdater.files", file)
        val intent = Intent(Intent.ACTION_VIEW).apply {
          setDataAndType(content, "application/vnd.android.package-archive")
          clipData = ClipData.newRawUri("Vaani update", content)
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        // Android checks signing and asks the user to confirm. Never claim installation succeeded.
        activity.startActivity(intent)
        "installer_opened"
      }
    }.runOnQueue(Queues.MAIN)
  }
}
