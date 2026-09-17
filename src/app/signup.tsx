import { useAppStyles, useAppTheme, type AppColors } from '@/context/AppThemeContext';
import { signup } from "@/services/auth";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    View,
} from "react-native";

export default function SignupScreen() {
  const styles = useAppStyles(createStyles);
  const { colors, mode } = useAppTheme();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const capturePhoto = async () => {
    try {
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

      setPhoto(image);
    } catch (error) {
      Alert.alert(
        "Camera error",
        error instanceof Error ? error.message : "Unable to take a photo. Please try again."
      );
    }
  };

  const handleSignup = async () => {
    if (
      !username.trim() ||
      !password ||
      !firstName.trim() ||
      !email.trim() ||
      !phone.trim()
    ) {
      Alert.alert("Signup", "Please fill in all required fields.");
      return;
    }
    if (!photo) {
      Alert.alert("Signup", "Please capture your enrollment photo.");
      return;
    }
    if (!consent) {
      Alert.alert("Signup", "Please agree to using your photo for attendance verification.");
      return;
    }

    try {
      setLoading(true);

      const result = await signup({
        username: username.trim(),
        password,
        first_name: firstName.trim(),
        last_name: lastName.trim() || undefined,
        email: email.trim(),
        phone: phone.trim(),
        photo,
        consent,
      });

      Alert.alert("Registration submitted", result.detail, [
        { text: "OK", onPress: () => router.replace("/login") },
      ]);
    } catch (error) {
      Alert.alert(
        "Signup Failed",
        error instanceof Error ? error.message : "Unable to sign up. Please try again."
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
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Vaani</Text>
        <Text style={styles.subtitle}>Employee Signup</Text>

        <View style={styles.form}>
          <Text style={styles.label}>Username</Text>
          <TextInput placeholderTextColor={colors.placeholder} keyboardAppearance={mode}
            style={styles.input}
            placeholder="Choose a username"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput placeholderTextColor={colors.placeholder} keyboardAppearance={mode}
            style={styles.input}
            placeholder="Choose a password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            editable={!loading}
          />

          <Text style={styles.label}>First name</Text>
          <TextInput placeholderTextColor={colors.placeholder} keyboardAppearance={mode}
            style={styles.input}
            placeholder="First name"
            value={firstName}
            onChangeText={setFirstName}
            editable={!loading}
          />

          <Text style={styles.label}>Last name (optional)</Text>
          <TextInput placeholderTextColor={colors.placeholder} keyboardAppearance={mode}
            style={styles.input}
            placeholder="Last name"
            value={lastName}
            onChangeText={setLastName}
            editable={!loading}
          />

          <Text style={styles.label}>Email</Text>
          <TextInput placeholderTextColor={colors.placeholder} keyboardAppearance={mode}
            style={styles.input}
            placeholder="you@example.com"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            editable={!loading}
          />

          <Text style={styles.label}>Phone</Text>
          <TextInput placeholderTextColor={colors.placeholder} keyboardAppearance={mode}
            style={styles.input}
            placeholder="+15551234567"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            editable={!loading}
          />

          <Text style={styles.label}>Enrollment photo</Text>
          <Text style={styles.helperText}>
            Capture a clear photo of your face with the front camera. An administrator reviews it
            before you can sign in.
          </Text>

          {photo && (
            <Image
              source={{ uri: `data:image/jpeg;base64,${photo}` }}
              style={styles.preview}
            />
          )}

          <Pressable
            style={[styles.secondaryButton, loading && styles.buttonDisabled]}
            onPress={capturePhoto}
            disabled={loading}
          >
            <Text style={styles.secondaryButtonText}>
              {photo ? "Retake photo" : "Take photo"}
            </Text>
          </Pressable>

          <View style={styles.consentRow}>
            <Switch value={consent} onValueChange={setConsent} disabled={loading} />
            <Text style={[styles.helperText, { flex: 1, marginBottom: 0 }]}>
              I consent to using my photo for attendance verification.
            </Text>
          </View>

          <Pressable
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSignup}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.buttonText}>Create account</Text>
            )}
          </Pressable>

          <Pressable
            style={styles.linkButton}
            onPress={() => router.replace("/login")}
            disabled={loading}
          >
            <Text style={styles.linkButtonText}>Already have an account? Log in</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },

  content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 40,
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
    marginBottom: 32,
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

  preview: {
    width: 96,
    height: 96,
    borderRadius: 12,
    marginBottom: 16,
    backgroundColor: colors.surfaceMuted,
  },

  consentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 16,
    marginBottom: 20,
  },

  button: {
    height: 52,
    borderRadius: 10,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
  },

  secondaryButton: {
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },

  buttonDisabled: {
    opacity: 0.7,
  },

  buttonText: {
    color: colors.onPrimary,
    fontSize: 16,
    fontWeight: "600",
  },

  secondaryButtonText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: "600",
  },

  linkButton: {
    marginTop: 20,
    alignItems: "center",
  },

  linkButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "600",
  },
});
