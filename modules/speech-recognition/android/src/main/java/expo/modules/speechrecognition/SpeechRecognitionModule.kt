package expo.modules.speechrecognition

import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise

class SpeechRecognitionModule : Module() {
  private var speechRecognizer: SpeechRecognizer? = null
  private val mainHandler = Handler(Looper.getMainLooper())
  private var isListening = false

  override fun definition() = ModuleDefinition {
    Name("SpeechRecognition")

    Events("onSpeechStart", "onSpeechResults", "onSpeechPartialResults", "onSpeechError", "onSpeechEnd")

    AsyncFunction("isRecognitionAvailable") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      SpeechRecognizer.isRecognitionAvailable(context)
    }

    AsyncFunction("startListening") { language: String?, promise: Promise ->
      mainHandler.post {
        try {
          val context = appContext.reactContext
          if (context == null) {
            promise.reject("ERR_NO_CONTEXT", "React context is unavailable", null)
            return@post
          }

          if (!SpeechRecognizer.isRecognitionAvailable(context)) {
            promise.reject("ERR_NOT_AVAILABLE", "Speech recognition is not available on this device", null)
            return@post
          }

          destroyInternal()

          val recognizer = SpeechRecognizer.createSpeechRecognizer(context)
          speechRecognizer = recognizer

          recognizer.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {
              isListening = true
              sendEvent("onSpeechStart", emptyMap<String, Any>())
            }

            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}

            override fun onEndOfSpeech() {
              isListening = false
              sendEvent("onSpeechEnd", emptyMap<String, Any>())
            }

            override fun onError(error: Int) {
              isListening = false
              val msg = getErrorMessage(error)
              sendEvent("onSpeechError", mapOf("error" to error, "message" to msg))
              sendEvent("onSpeechEnd", emptyMap<String, Any>())
            }

            override fun onResults(results: Bundle?) {
              isListening = false
              val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
              val text = matches?.firstOrNull() ?: ""
              if (text.isNotEmpty()) {
                sendEvent("onSpeechResults", mapOf("value" to text))
              }
              sendEvent("onSpeechEnd", emptyMap<String, Any>())
            }

            override fun onPartialResults(partialResults: Bundle?) {
              val matches = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
              val text = matches?.firstOrNull() ?: ""
              if (text.isNotEmpty()) {
                sendEvent("onSpeechPartialResults", mapOf("value" to text))
              }
            }

            override fun onEvent(eventType: Int, params: Bundle?) {}
          })

          val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            if (!language.isNullOrEmpty()) {
              putExtra(RecognizerIntent.EXTRA_LANGUAGE, language)
            }
          }

          recognizer.startListening(intent)
          promise.resolve(true)
        } catch (e: Exception) {
          isListening = false
          promise.reject("ERR_START_FAILED", e.message ?: "Failed to start speech recognition", e)
        }
      }
    }

    AsyncFunction("stopListening") { promise: Promise ->
      mainHandler.post {
        stopInternal()
        promise.resolve(true)
      }
    }

    AsyncFunction("destroy") { promise: Promise ->
      mainHandler.post {
        destroyInternal()
        promise.resolve(true)
      }
    }
  }

  private fun stopInternal() {
    try {
      speechRecognizer?.stopListening()
    } catch (_: Exception) {}
    isListening = false
  }

  private fun destroyInternal() {
    try {
      speechRecognizer?.stopListening()
      speechRecognizer?.destroy()
    } catch (_: Exception) {}
    speechRecognizer = null
    isListening = false
  }

  private fun getErrorMessage(error: Int): String {
    return when (error) {
      SpeechRecognizer.ERROR_AUDIO -> "Audio recording error"
      SpeechRecognizer.ERROR_CLIENT -> "Client error"
      SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Microphone permission required"
      SpeechRecognizer.ERROR_NETWORK -> "Network error"
      SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "Network timeout"
      SpeechRecognizer.ERROR_NO_MATCH -> "No speech recognized"
      SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "Recognition service busy"
      SpeechRecognizer.ERROR_SERVER -> "Server error"
      SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "No speech detected"
      else -> "Speech recognition error ($error)"
    }
  }
}
