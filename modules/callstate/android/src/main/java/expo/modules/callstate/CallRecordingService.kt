package expo.modules.callstate

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.media.MediaRecorder
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import androidx.core.content.ContextCompat
import java.io.File
import java.util.UUID

/** Local-only MIC experiment. A successful file does NOT prove cellular audio capture. */
class CallRecordingService : Service() {
  private var recorder: MediaRecorder? = null
  private var output: File? = null
  private var startedAt = 0L
  private var sawOffhook = false
  private val armTimeout = Runnable { finish("No OFFHOOK within 60 seconds") }
  // Cleanup fallback if a vendor delays/drops the module's IDLE callback.
  private val idleCheck = object : Runnable {
    override fun run() {
      if (instance !== this@CallRecordingService) return
      try {
        @Suppress("DEPRECATION")
        val state = getSystemService(android.telephony.TelephonyManager::class.java).callState
        if (sawOffhook && state == android.telephony.TelephonyManager.CALL_STATE_IDLE) {
          finish("IDLE watchdog")
          return
        }
      } catch (error: Exception) {
        Log.e(TAG, "Cannot verify call state; stopping recording safely", error)
        finish("Call-state verification failed")
        return
      }
      main.postDelayed(this, 2000)
    }
  }

  companion object {
    private const val TAG = "CALL_RECORDING"
    private const val CHANNEL = "call_recording_poc"
    private val main = Handler(Looper.getMainLooper())
    private var instance: CallRecordingService? = null
    private var ready: ((Boolean) -> Unit)? = null
    @Volatile private var recording = false
    @Volatile private var path: String? = null

    // Called on the main queue while the caller activity is still visible.
    fun prepare(context: Context, callback: (Boolean) -> Unit) {
      if (instance != null || ready != null) {
        Log.w(TAG, "Recording service already prepared or preparing")
        callback(instance != null)
        return
      }
      if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) !=
        PackageManager.PERMISSION_GRANTED) {
        Log.e(TAG, "RECORD_AUDIO permission denied; call will continue without recording")
        callback(false)
        return
      }
      path = null
      ready = callback
      try {
        ContextCompat.startForegroundService(context, Intent(context, CallRecordingService::class.java))
      } catch (error: Exception) {
        Log.e(TAG, "Cannot prepare microphone foreground service", error)
        completePreparation(false)
      }
      main.postDelayed({
        if (ready === callback) {
          Log.e(TAG, "Recording service preparation timed out")
          completePreparation(false)
          context.stopService(Intent(context, CallRecordingService::class.java))
        }
      }, 5000)
    }

    private fun completePreparation(success: Boolean) {
      val callback = ready
      ready = null
      callback?.invoke(success)
    }

    fun onCallState(state: Int) {
      main.post {
        val service = instance ?: return@post
        when (state) {
          android.telephony.TelephonyManager.CALL_STATE_OFFHOOK -> {
            service.sawOffhook = true
            service.startRecording()
          }
          android.telephony.TelephonyManager.CALL_STATE_IDLE ->
            if (service.sawOffhook) service.finish("IDLE")
        }
      }
    }

    fun start(): String? {
      val service = instance
      if (service == null) {
        Log.e(TAG, "startRecording requires prepareRecording while app is visible")
        return null
      }
      return service.startRecording()
    }

    fun stop(reason: String): String? {
      instance?.finish(reason)
      return path
    }

    fun cleanup(reason: String) { main.post { stop(reason) } }
    fun isRecording() = recording
    fun getRecordingPath() = path
  }

  override fun onCreate() {
    super.onCreate()
    try {
      val manager = getSystemService(NotificationManager::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        manager.createNotificationChannel(NotificationChannel(CHANNEL,
          "Local call recording test", NotificationManager.IMPORTANCE_LOW))
      }
      val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
        Notification.Builder(this, CHANNEL) else Notification.Builder(this)
      val notification = builder.setSmallIcon(android.R.drawable.ic_btn_speak_now)
        .setContentTitle("Local call recording test")
        .setContentText("Microphone recording armed for this call")
        .setOngoing(true).build()
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        startForeground(7821, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
      } else {
        startForeground(7821, notification)
      }
      instance = this
      main.postDelayed(armTimeout, 60_000)
      main.postDelayed(idleCheck, 2000)
      Log.i(TAG, "Microphone service ready; waiting for OFFHOOK")
      completePreparation(true)
    } catch (error: Exception) {
      Log.e(TAG, "Microphone foreground service/permission error", error)
      completePreparation(false)
      stopSelf()
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int) = START_NOT_STICKY
  override fun onBind(intent: Intent?): IBinder? = null

  private fun startRecording(): String? {
    if (recorder != null) return path
    sawOffhook = true
    main.removeCallbacks(armTimeout)
    try {
      // noBackupFilesDir keeps sensitive recordings local and out of Android backup.
      val directory = File(noBackupFilesDir, "call-recordings")
      check(directory.isDirectory || directory.mkdirs()) { "Cannot create recording directory" }
      output = File(directory, "call_${System.currentTimeMillis()}_${UUID.randomUUID()}.m4a")
      @Suppress("DEPRECATION")
      val next = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) MediaRecorder(this)
        else MediaRecorder()
      recorder = next
      next.setAudioSource(MediaRecorder.AudioSource.MIC)
      next.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
      next.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
      next.setAudioChannels(1)
      next.setAudioSamplingRate(44100)
      next.setAudioEncodingBitRate(96000)
      next.setOutputFile(output!!.absolutePath)
      next.setOnErrorListener { _, what, extra ->
        main.post {
          if (recorder === next) {
            Log.e(TAG, "MediaRecorder error what=$what extra=$extra")
            finish("Recorder error", discard = true)
          }
        }
      }
      next.prepare()
      next.start()
      recording = true
      startedAt = SystemClock.elapsedRealtime()
      path = output!!.absolutePath
      Log.i(TAG, "Recording started source=MIC format=AAC/M4A path=$path; two-way audio unverified")
      return path
    } catch (error: Exception) {
      Log.e(TAG, "Recording start failed (permission/device/audio contention)", error)
      finish("Start failed", discard = true)
      return null
    }
  }

  private fun releaseRecorder(reason: String, discard: Boolean = false) {
    val active = recorder ?: return
    recorder = null
    val durationMs = if (recording) SystemClock.elapsedRealtime() - startedAt else 0L
    var valid = recording && !discard
    try {
      if (recording) active.stop()
    } catch (error: Exception) {
      valid = false
      Log.e(TAG, "Recording stop failed; discarding incomplete file", error)
    } finally {
      recording = false
      try { active.release() } catch (error: Exception) { Log.e(TAG, "Recorder release failed", error) }
    }
    val file = output
    if (!valid || file == null || file.length() == 0L) {
      if (file != null && file.exists() && !file.delete()) Log.w(TAG, "Cannot delete invalid file: $file")
      path = null
      Log.w(TAG, "Recording stopped reason=$reason durationMs=$durationMs; no valid recording")
    } else {
      Log.i(TAG, "Recording stopped reason=$reason durationMs=$durationMs bytes=${file.length()} path=$path; listen to verify both sides")
    }
    output = null
  }

  private fun finish(reason: String, discard: Boolean = false) {
    main.removeCallbacks(armTimeout)
    main.removeCallbacks(idleCheck)
    releaseRecorder(reason, discard)
    if (instance === this) instance = null
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  override fun onTaskRemoved(rootIntent: Intent?) { finish("App task removed") }
  override fun onDestroy() {
    main.removeCallbacks(armTimeout)
    main.removeCallbacks(idleCheck)
    releaseRecorder("Service destroyed")
    if (instance === this) instance = null
    super.onDestroy()
  }
}
