import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Platform, SafeAreaView, StyleSheet, Text, View } from "react-native";

import { glow, ink, paper, radius, safelight, space } from "@luma/tokens";

// On web the dev server can proxy /api. On a device, Expo needs the LAN address
// of the Django server — set EXPO_PUBLIC_API_BASE_URL in .env.
const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

type Health = { status: string; database: boolean } | null;

export default function App() {
  const [health, setHealth] = useState<Health>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/health`)
      .then((response) => response.json())
      .then(setHealth)
      .catch(() => setError(true));
  }, []);

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" />
      <View style={styles.content}>
        <Text style={styles.eyebrow}>LUMA</Text>
        <Text style={styles.title}>Host</Text>
        <Text style={styles.body}>
          One codebase for iOS, Android and web. Running on {Platform.OS}.
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>API</Text>
          <Text style={[styles.cardValue, error && styles.cardValueError]}>
            {error ? "unreachable" : health ? health.status : "checking…"}
          </Text>
          <Text style={styles.cardMeta}>{API_BASE}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

// Light by default — people plan weddings on laptops in daylight. DESIGN.md §11.
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: paper["000"],
  },
  content: {
    flex: 1,
    justifyContent: "center",
    padding: space[6],
    gap: space[3],
    maxWidth: 560,
    width: "100%",
    alignSelf: "center",
  },
  eyebrow: {
    fontSize: 13,
    fontWeight: "500",
    letterSpacing: 1.2,
    color: ink[500],
  },
  title: {
    fontSize: 32,
    lineHeight: 38,
    color: ink[900],
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    color: ink[500],
  },
  card: {
    marginTop: space[4],
    padding: space[4],
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: paper[200],
    gap: space[1],
  },
  cardLabel: {
    fontSize: 13,
    fontWeight: "500",
    letterSpacing: 1.2,
    color: ink[500],
  },
  cardValue: {
    fontSize: 24,
    color: glow[700],
    fontVariant: ["tabular-nums"],
  },
  cardValueError: {
    color: safelight,
  },
  cardMeta: {
    fontSize: 13,
    color: ink[500],
  },
});
