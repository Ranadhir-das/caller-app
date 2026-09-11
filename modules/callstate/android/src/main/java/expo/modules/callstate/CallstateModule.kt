package expo.modules.callstate

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.telephony.PhoneStateListener
import android.telephony.TelephonyManager
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class CallstateModule : Module() {

  private var telephonyManager: TelephonyManager? = null
  private var phoneStateListener: PhoneStateListener? = null

  override fun definition() = ModuleDefinition {

    Name("Callstate")

    Events("onCallStateChanged")

    OnStartObserving {
      startListening()
    }

    OnStopObserving {
      stopListening()
    }

    Function("startMonitoring") {
      startListening()
    }

    Function("getCurrentState") {

      val context = appContext.reactContext
        ?: throw Exception("React context is not available")

      if (
        ContextCompat.checkSelfPermission(
          context,
          Manifest.permission.READ_PHONE_STATE
        ) != PackageManager.PERMISSION_GRANTED
      ) {
        throw SecurityException(
          "READ_PHONE_STATE permission not granted"
        )
      }

      val manager =
        context.getSystemService(
          TelephonyManager::class.java
        )

      when (manager.callState) {

        TelephonyManager.CALL_STATE_RINGING ->
          "RINGING"

        TelephonyManager.CALL_STATE_OFFHOOK ->
          "OFFHOOK"

        TelephonyManager.CALL_STATE_IDLE ->
          "IDLE"

        else ->
          "UNKNOWN"
      }
    }

    Function("startCall") { phoneNumber: String ->

      val context = appContext.reactContext
        ?: throw Exception("React context is not available")

      if (
        ContextCompat.checkSelfPermission(
          context,
          Manifest.permission.CALL_PHONE
        ) != PackageManager.PERMISSION_GRANTED
      ) {
        throw SecurityException(
          "CALL_PHONE permission not granted"
        )
      }

      android.util.Log.d(
        "CALLSTATE",
        "Starting call: $phoneNumber"
      )

      val intent = Intent(Intent.ACTION_CALL).apply {
        data = Uri.parse("tel:$phoneNumber")
        flags = Intent.FLAG_ACTIVITY_NEW_TASK
      }

      context.startActivity(intent)
    }
  }

  private fun startListening() {

    val context = appContext.reactContext
      ?: return

    if (
      ContextCompat.checkSelfPermission(
        context,
        Manifest.permission.READ_PHONE_STATE
      ) != PackageManager.PERMISSION_GRANTED
    ) {
      android.util.Log.e(
        "CALLSTATE",
        "READ_PHONE_STATE permission NOT granted"
      )
      return
    }

    if (telephonyManager != null) {
      return
    }

    telephonyManager =
      context.getSystemService(
        TelephonyManager::class.java
      )

    phoneStateListener =
      object : PhoneStateListener() {

        override fun onCallStateChanged(
          state: Int,
          phoneNumber: String?
        ) {

          val callState = when (state) {

            TelephonyManager.CALL_STATE_RINGING ->
              "RINGING"

            TelephonyManager.CALL_STATE_OFFHOOK ->
              "OFFHOOK"

            TelephonyManager.CALL_STATE_IDLE ->
              "IDLE"

            else ->
              "UNKNOWN"
          }

          android.util.Log.d(
            "CALLSTATE",
            "Native call state: $callState"
          )

          sendEvent(
            "onCallStateChanged",
            mapOf(
              "state" to callState
            )
          )
        }
      }

    @Suppress("DEPRECATION")
    telephonyManager?.listen(
      phoneStateListener,
      PhoneStateListener.LISTEN_CALL_STATE
    )

    android.util.Log.d(
      "CALLSTATE",
      "PhoneStateListener registered"
    )
  }

  private fun stopListening() {

    telephonyManager?.let { manager ->

      phoneStateListener?.let { listener ->

        @Suppress("DEPRECATION")
        manager.listen(
          listener,
          PhoneStateListener.LISTEN_NONE
        )
      }
    }

    phoneStateListener = null
    telephonyManager = null
  }
}