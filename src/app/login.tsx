import { PasswordInput } from '@/components/PasswordInput';
import { useAppStyles, useAppTheme, type AppColors } from '@/context/AppThemeContext';
import { useAuth } from "@/context/AuthContext";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { getCurrentCoords } from "@/services/location";
import { useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    View,
} from "react-native";

type PendingChallenge = {
  id: string;
  action: "ENROLL" | "IN";
  reviewNote?: string;
};

export default function LoginScreen() {
  const styles = useAppStyles(createStyles);
  const { colors, mode } = useAppTheme();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [challenge, setChallenge] = useState<PendingChallenge | null>(null);
  const [consent, setConsent] = useState(false);
  const [loginRemark, setLoginRemark] = useState("");

  const { beginLogin, completeLogin } = useAuth();

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning!";
    if (hour < 17) return "Good afternoon!";
    return "Good evening!";
  };

  const handleLogin = async () => {
    if (!username.trim() || !password) {
      Alert.alert("Login", "Please enter username and password.");
      return;
    }

    try {
      setLoading(true);

      const result = await beginLogin(username.trim(), password);

      if (result.status === "PENDING") {
        Alert.alert(
          "Awaiting approval",
          result.detail || "Your enrollment photo is awaiting administrator approval."
        );
        return;
      }

      if (!result.challenge) {
        throw new Error("Unexpected response from server.");
      }

      if (!result.photo_required) {
        // No camera step needed (e.g. admin sign-in) — finish immediately.
        const location = await getCurrentCoords();
        const verified = await completeLogin(result.challenge, undefined, undefined, location, loginRemark.trim() || undefined);
        if ("token" in verified) {
          router.replace("/employee" as never);
        } else {
          Alert.alert("Almost there", verified.detail);
        }
        return;
      }

      setConsent(false);
      setChallenge({
        id: result.challenge,
        action: result.status === "ENROLLMENT_REQUIRED" ? "ENROLL" : "IN",
        reviewNote: result.review_note,
      });
    } catch (error) {
      console.error("Login error:", error);

      Alert.alert(
        "Login Failed",
        error instanceof Error
          ? error.message
          : "Unable to login. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const capturePhoto = async () => {
    if (!challenge) return;

    if (challenge.action === "ENROLL" && !consent) {
      Alert.alert("Consent required", "Please agree to photo attendance to continue.");
      return;
    }

    try {
      setLoading(true);

      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        throw new Error("Camera permission is required. Enable it in phone settings.");
      }

      const result = await ImagePicker.launchCameraAsync({
        cameraType: ImagePicker.CameraType.front,
        mediaTypes: ["images"],
        quality: 0.4,
        base64: true,
        allowsEditing: false,
      });
      if (result.canceled) return;

      const image = result.assets[0].base64;
      if (!image) throw new Error("Photo could not be read. Please try again.");

      const location = await getCurrentCoords();
      const verified = await completeLogin(
        challenge.id,
        image,
        challenge.action === "ENROLL",
        location,
        loginRemark.trim() || undefined
      );

      if ("token" in verified) {
        router.replace("/employee" as never);
      } else {
        Alert.alert("Submitted", verified.detail);
        setChallenge(null);
        setLoginRemark("");
      }
    } catch (error) {
      console.error("Login verification error:", error);

      Alert.alert(
        "Verification Failed",
        error instanceof Error
          ? error.message
          : "Unable to verify your photo. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.content}>
        <Image
          source={require('@/assets/images/vaani-mark.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.title}>Vaani</Text>

        <Text style={styles.subtitle}>
          Employee Login
        </Text>

        {challenge ? (
          <View style={styles.form}>
            <Text style={styles.label}>
              {challenge.action === "ENROLL"
                ? "Enrollment photo required"
                : "Attendance Login"}
            </Text>

            <Text style={styles.helperText}>
              {challenge.action === "ENROLL"
                ? "Capture a clear photo of your face with the front camera. An administrator reviews it before check-in becomes available."
                : "Take a fresh photo with the front camera to confirm your attendance."}
            </Text>

            {!!challenge.reviewNote && (
              <Text style={[styles.helperText, { color: colors.danger }]}>
                Previous attempt: {challenge.reviewNote}
              </Text>
            )}

            {challenge.action === "IN" && (
              <View style={styles.remarkContainer}>
                <View style={styles.greetingHeader}>
                  <Text style={styles.greetingText}>{getGreeting()}</Text>
                  <Text style={styles.loginTimeText}>
                    Login time: {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>

                <View style={styles.remarkHeaderRow}>
                  <Text style={styles.remarkLabel}>Attendance Remark (Optional)</Text>
                  <Text style={styles.charCounter}>{loginRemark.length}/500</Text>
                </View>

                <TextInput
                  placeholderTextColor={colors.placeholder}
                  keyboardAppearance={mode}
                  style={styles.remarkInput}
                  placeholder="Optional: explain if you are logging in late"
                  value={loginRemark}
                  onChangeText={(text) => setLoginRemark(text.slice(0, 500))}
                  multiline
                  numberOfLines={3}
                  maxLength={500}
                  editable={!loading}
                  textAlignVertical="top"
                />
              </View>
            )}

            {challenge.action === "ENROLL" && (
              <View style={styles.consentRow}>
                <Switch value={consent} onValueChange={setConsent} disabled={loading} />
                <Text style={[styles.helperText, { flex: 1, marginBottom: 0 }]}>
                  I consent to using my photo for attendance verification.
                </Text>
              </View>
            )}

            <Pressable
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={capturePhoto}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.buttonText}>
                  {challenge.action === "IN" ? "Take photo & Check in" : "Take photo"}
                </Text>
              )}
            </Pressable>

            <Pressable
              style={styles.linkButton}
              onPress={() => {
                setChallenge(null);
                setLoginRemark("");
              }}
              disabled={loading}
            >
              <Text style={styles.linkButtonText}>Back to login</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.form}>
            <Text style={styles.label}>Username</Text>

            <TextInput placeholderTextColor={colors.placeholder} keyboardAppearance={mode}
              style={styles.input}
              placeholder="Enter username"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />

            <Text style={styles.label}>Password</Text>

            <PasswordInput placeholderTextColor={colors.placeholder} keyboardAppearance={mode}
              style={styles.input}
              placeholder="Enter password"
              value={password}
              onChangeText={setPassword}
              autoCapitalize="none"
              editable={!loading}
            />

            <Pressable
              style={[
                styles.button,
                loading && styles.buttonDisabled,
              ]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.buttonText}>
                  Login
                </Text>
              )}
            </Pressable>

            <Pressable
              style={styles.linkButton}
              onPress={() => router.push("/signup")}
              disabled={loading}
            >
              <Text style={styles.linkButtonText}>New employee? Sign up</Text>
            </Pressable>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },

  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },

  logo: {
    width: 68,
    height: 68,
    alignSelf: 'center',
    marginBottom: 12,
  },

  title: {
    color: colors.text,
    fontSize: 32,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
  },

  subtitle: {
    color: colors.text,
    fontSize: 18,
    textAlign: "center",
    marginBottom: 40,
  },

  form: {
    width: "100%",
  },

  label: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 8,
    marginTop: 16,
  },

  input: {
    color: colors.text,
    height: 52,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    fontSize: 16,
    backgroundColor: colors.surfaceMuted,
  },

  helperText: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },

  consentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 20,
  },

  linkButton: {
    marginTop: 16,
    alignItems: "center",
  },

  linkButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "600",
  },

  button: {
    height: 52,
    borderRadius: 10,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 28,
  },

  buttonDisabled: {
    opacity: 0.7,
  },

  buttonText: {
    color: colors.onPrimary,
    fontSize: 16,
    fontWeight: "600",
  },

  remarkContainer: {
    marginVertical: 14,
    padding: 14,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },

  greetingHeader: {
    marginBottom: 12,
  },

  greetingText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 2,
  },

  loginTimeText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "500",
    opacity: 0.85,
  },

  remarkHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },

  remarkLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600",
  },

  charCounter: {
    color: colors.muted,
    fontSize: 11,
  },

  remarkInput: {
    color: colors.text,
    minHeight: 76,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: colors.surface,
  },
});
