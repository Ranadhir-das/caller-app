package expo.modules.quickcapture

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class QuickCaptureModule : Module() {
  private var consumedInitialUri: String? = null

  override fun definition() = ModuleDefinition {
    Name("QuickCapture")

    Events("onShareIntent")

    OnNewIntent { intent ->
      handleIncomingIntent(intent)
    }

    AsyncFunction("isOcrAvailable") {
      true
    }

    AsyncFunction("recognizeText") { imageUri: String, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("ERR_NO_CONTEXT", "React context is unavailable", null)
        return@AsyncFunction
      }

      try {
        val uri = if (imageUri.startsWith("content://") || imageUri.startsWith("file://")) {
          Uri.parse(imageUri)
        } else {
          Uri.fromFile(java.io.File(imageUri))
        }

        val image = InputImage.fromFilePath(context, uri)
        val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

        recognizer.process(image)
          .addOnSuccessListener { visionText ->
            promise.resolve(visionText.text ?: "")
          }
          .addOnFailureListener { error ->
            promise.reject("ERR_OCR_FAILED", error.localizedMessage ?: "Failed to extract text from image", error)
          }
      } catch (e: Exception) {
        promise.reject("ERR_IMAGE_LOAD", e.localizedMessage ?: "Could not load image file", e)
      }
    }

    AsyncFunction("recognizeTextDetails") { imageUri: String, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("ERR_NO_CONTEXT", "React context is unavailable", null)
        return@AsyncFunction
      }

      try {
        val uri = if (imageUri.startsWith("content://") || imageUri.startsWith("file://")) {
          Uri.parse(imageUri)
        } else {
          Uri.fromFile(java.io.File(imageUri))
        }

        val image = InputImage.fromFilePath(context, uri)
        val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

        recognizer.process(image)
          .addOnSuccessListener { visionText ->
            val blocksList = ArrayList<Map<String, Any?>>()
            for (block in visionText.textBlocks) {
              val linesList = ArrayList<Map<String, Any?>>()
              for (line in block.lines) {
                val lineMap = HashMap<String, Any?>()
                lineMap["text"] = line.text
                val rect = line.boundingBox
                if (rect != null) {
                  lineMap["boundingBox"] = mapOf(
                    "left" to rect.left,
                    "top" to rect.top,
                    "right" to rect.right,
                    "bottom" to rect.bottom,
                    "width" to rect.width(),
                    "height" to rect.height()
                  )
                }
                val elementsList = ArrayList<Map<String, Any?>>()
                for (element in line.elements) {
                  val elementMap = HashMap<String, Any?>()
                  elementMap["text"] = element.text
                  val elRect = element.boundingBox
                  if (elRect != null) {
                    elementMap["boundingBox"] = mapOf(
                      "left" to elRect.left,
                      "top" to elRect.top,
                      "right" to elRect.right,
                      "bottom" to elRect.bottom,
                      "width" to elRect.width(),
                      "height" to elRect.height()
                    )
                  }
                  elementsList.add(elementMap)
                }
                lineMap["elements"] = elementsList
                linesList.add(lineMap)
              }
              val blockMap = HashMap<String, Any?>()
              blockMap["text"] = block.text
              val blockRect = block.boundingBox
              if (blockRect != null) {
                blockMap["boundingBox"] = mapOf(
                  "left" to blockRect.left,
                  "top" to blockRect.top,
                  "right" to blockRect.right,
                  "bottom" to blockRect.bottom,
                  "width" to blockRect.width(),
                  "height" to blockRect.height()
                )
              }
              blockMap["lines"] = linesList
              blocksList.add(blockMap)
            }

            promise.resolve(
              mapOf(
                "text" to (visionText.text ?: ""),
                "blocks" to blocksList
              )
            )
          }
          .addOnFailureListener { error ->
            promise.reject("ERR_OCR_FAILED", error.localizedMessage ?: "Failed to extract text from image", error)
          }
      } catch (e: Exception) {
        promise.reject("ERR_IMAGE_LOAD", e.localizedMessage ?: "Could not load image file", e)
      }
    }

    AsyncFunction("getInitialShareIntent") {
      val activity: Activity? = appContext.currentActivity
      val intent = activity?.intent ?: return@AsyncFunction null

      if (intent.action == Intent.ACTION_SEND) {
        val mimeType = intent.type ?: ""
        if (mimeType.startsWith("image/")) {
          val streamUri = getStreamUriFromIntent(intent)
          if (streamUri != null) {
            val uriString = streamUri.toString()
            if (uriString != consumedInitialUri) {
              return@AsyncFunction mapOf(
                "uri" to uriString,
                "mimeType" to mimeType
              )
            }
          }
        }
      }
      null
    }

    AsyncFunction("clearShareIntent") {
      val activity: Activity? = appContext.currentActivity
      val intent = activity?.intent
      if (intent != null && intent.action == Intent.ACTION_SEND) {
        val streamUri = getStreamUriFromIntent(intent)
        if (streamUri != null) {
          consumedInitialUri = streamUri.toString()
        }
        intent.action = null
        intent.removeExtra(Intent.EXTRA_STREAM)
      }
      true
    }
  }

  private fun handleIncomingIntent(intent: Intent?) {
    if (intent == null || intent.action != Intent.ACTION_SEND) return
    val mimeType = intent.type ?: return
    if (!mimeType.startsWith("image/")) return

    val streamUri = getStreamUriFromIntent(intent) ?: return
    // Keep warm shares available until the destination screen mounts and consumes them.
    appContext.currentActivity?.intent = intent
    consumedInitialUri = null
    sendEvent(
      "onShareIntent",
      mapOf(
        "uri" to streamUri.toString(),
        "mimeType" to mimeType
      )
    )
  }

  private fun getStreamUriFromIntent(intent: Intent): Uri? {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
    } else {
      @Suppress("DEPRECATION")
      intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
    }
  }
}
