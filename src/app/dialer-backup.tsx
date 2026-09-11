import { StyleSheet, Text, View } from "react-native";

export default function DialerScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Dialer</Text>
      <Text style={styles.text}>
        Dialer temporarily unavailable while authentication is being connected.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },

  title: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 12,
  },

  text: {
    fontSize: 15,
    textAlign: "center",
  },
});