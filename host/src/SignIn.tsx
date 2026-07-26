/**
 * Host sign-in — two screens, one field each. DESIGN.md §12, CONCEPT.md §4.
 *
 * There is no "log in / sign up" choice: the visitor types an email and the
 * system works out which it is. Nothing here reveals whether an account
 * already exists.
 */

import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useSafeAreaInsets } from "react-native-safe-area-context";

import { glow, ink, paper, radius, safelight, space } from "@luma/tokens";

import { ApiError, api, type User } from "./api";
import { useI18n } from "./i18n";
import { saveToken } from "./session";
import { Wordmark } from "./Wordmark";

const CODE_LENGTH = 6;

type Step = "email" | "code";

export function SignIn({ onSignedIn }: { onSignedIn: (user: User) => void }) {
  const insets = useSafeAreaInsets();
  const { t, locale } = useI18n();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const codeInput = useRef<TextInput>(null);

  // A visible countdown. "Try again later" with no number reads as broken.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function requestCode(isResend = false) {
    setError(null);
    setBusy(true);
    try {
      const result = await api.requestCode(email.trim(), locale);
      setCooldown(result.resend_available_in);
      setStep("code");
      if (isResend) setCode("");
      setTimeout(() => codeInput.current?.focus(), 100);
    } catch (caught) {
      // Each failure says what to do next, and none of them blames the person
      // for something that isn't theirs to fix. DESIGN.md §12.
      if (caught instanceof ApiError && caught.status === 429) {
        setCooldown(caught.retryAfter ?? 60);
        setStep("code");
        setError(t("error.tooManyCodes"));
      } else if (caught instanceof ApiError && caught.status === 422) {
        setError(t("error.invalidEmail"));
      } else if (caught instanceof ApiError && caught.status >= 500) {
        // The server was reached and failed to send. Telling someone to check
        // their connection here sends them chasing a problem they don't have.
        setError(t("error.sendFailed"));
      } else if (caught instanceof ApiError) {
        setError(t("error.generic"));
      } else {
        // fetch() itself threw: no server, no network, wrong API base URL.
        setError(t("error.offline"));
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(value: string) {
    setError(null);
    setBusy(true);
    try {
      const result = await api.verifyCode(email.trim(), value);
      await saveToken(result.token);
      onSignedIn(result.user);
    } catch (caught) {
      // Deliberately one message. Telling someone *why* a code failed helps
      // an attacker more than it helps them.
      setError(t("error.badCode"));
      setCode("");
      codeInput.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  function onCodeChange(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, CODE_LENGTH);
    setCode(digits);
    setError(null);
    // Submit only on a complete code — never on a partial one.
    if (digits.length === CODE_LENGTH) void submitCode(digits);
  }

  return (
    <View
      style={[
        styles.wrap,
        { paddingTop: insets.top + space[6], paddingBottom: insets.bottom + space[6] },
      ]}
    >
      <View style={styles.brand}>
        <Wordmark />
      </View>
      <View style={styles.centre}>
      {step === "email" ? (
        <View style={styles.form}>
          <Text style={styles.title}>{t("signIn.title")}</Text>
          <Text style={styles.body}>{t("signIn.lede")}</Text>

          <TextInput
            style={styles.input}
            value={email}
            onChangeText={(value) => {
              setEmail(value);
              setError(null);
            }}
            placeholder={t("signIn.emailPlaceholder")}
            placeholderTextColor={ink[600]}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            inputMode="email"
            returnKeyType="go"
            onSubmitEditing={() => email.trim() && requestCode()}
            accessibilityLabel={t("signIn.emailLabel")}
            editable={!busy}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button
            label={t("signIn.continue")}
            onPress={() => requestCode()}
            disabled={!email.trim() || busy}
            busy={busy}
          />
        </View>
      ) : (
        <View style={styles.form}>
          <Text style={styles.title}>{t("code.title")}</Text>
          <Text style={styles.body}>
            {t("code.lede", { length: CODE_LENGTH, email: email.trim() })}
          </Text>

          <TextInput
            ref={codeInput}
            style={[styles.input, styles.codeInput]}
            value={code}
            onChangeText={onCodeChange}
            placeholder="000000"
            placeholderTextColor={ink[600]}
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={CODE_LENGTH}
            // The single attribute that removes most of the friction: iOS and
            // Android offer the code above the keyboard.
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            autoFocus
            accessibilityLabel={t("code.inputLabel", { length: CODE_LENGTH })}
            editable={!busy}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {busy ? <ActivityIndicator color={glow[600]} /> : null}

          <View style={styles.actions}>
            <Pressable
              onPress={() => requestCode(true)}
              disabled={cooldown > 0 || busy}
              accessibilityRole="button"
              style={styles.linkTarget}
            >
              <Text style={[styles.link, cooldown > 0 && styles.linkDisabled]}>
                {cooldown > 0 ? t("code.resendIn", { seconds: cooldown }) : t("code.resend")}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                setStep("email");
                setCode("");
                setError(null);
              }}
              accessibilityRole="button"
              style={styles.linkTarget}
            >
              <Text style={styles.link}>{t("code.differentEmail")}</Text>
            </Pressable>
          </View>
        </View>
      )}
      </View>
    </View>
  );
}

function Button({
  label,
  onPress,
  disabled,
  busy,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        disabled && styles.buttonDisabled,
        pressed && styles.buttonPressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={paper["000"]} />
      ) : (
        <Text style={styles.buttonLabel}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    padding: space[6],
  },
  // The lockup sits at the top, its left edge lined up with the form below.
  brand: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
  },
  // The form stays optically centred in the space beneath the lockup.
  centre: {
    flex: 1,
    justifyContent: "center",
    width: "100%",
  },
  form: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    gap: space[3],
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
  strong: {
    color: ink[900],
  },
  input: {
    // 44pt minimum touch target, generous here because it is the only control.
    minHeight: 52,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    borderWidth: 1,
    borderColor: paper[300],
    borderRadius: radius.control,
    backgroundColor: paper["000"],
    fontSize: 17,
    color: ink[900],
    // The browser's default focus ring is deliberately left in place — these
    // screens must stay usable by keyboard.
  },
  codeInput: {
    fontSize: 28,
    letterSpacing: 8,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  error: {
    fontSize: 15,
    lineHeight: 22,
    color: safelight,
  },
  button: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: ink[900],
    marginTop: space[2],
  },
  buttonDisabled: {
    backgroundColor: paper[300],
  },
  buttonPressed: {
    opacity: 0.9,
  },
  buttonLabel: {
    color: paper["000"],
    fontSize: 16,
    fontWeight: "500",
  },
  actions: {
    marginTop: space[2],
    gap: space[1],
  },
  linkTarget: {
    minHeight: 44,
    justifyContent: "center",
  },
  link: {
    fontSize: 15,
    color: glow[700],
  },
  linkDisabled: {
    color: ink[500],
  },
});
