import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableWithoutFeedback,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import type { MemberType } from '@/domain/database';
import { useAuth } from '@/features/auth/auth-context';
import { getOriginalErrorMessage } from '@/features/network/supabase-read';
import { LuggageCountField } from '@/features/auth/LuggageCountField';
import { getLuggageCount } from '@/features/auth/luggage-count';
import { getPartySize, PartySizeField } from '@/features/auth/PartySizeField';
import { SimCardCountField } from '@/features/auth/SimCardCountField';
import { getSimCardCount } from '@/features/auth/sim-card-count';
import { useI18n } from '@/features/i18n/i18n';
import {
  forgotPasswordRoute,
  loginRoute,
  registerRoute,
  type ProtectedRoutePath,
} from '@/features/navigation/routes';
import { useOnboarding } from '@/features/onboarding/onboarding-state';
import { useTheme } from '@/hooks/use-theme';

type AuthMode = 'login' | 'register';
type AccountCoverage = 'family' | 'individual';

type AuthFormScreenProps = {
  mode: AuthMode;
  returnTo?: ProtectedRoutePath;
};

export function AuthFormScreen({ mode, returnTo }: AuthFormScreenProps) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const { t } = useI18n();
  const { signIn, signUp } = useAuth();
  const { completeOnboarding } = useOnboarding();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [memberType, setMemberType] = useState<MemberType | null>(null);
  const [accountCoverage, setAccountCoverage] = useState<AccountCoverage | null>(null);
  const [luggageCount, setLuggageCount] = useState('0');
  const [simCardCount, setSimCardCount] = useState('0');
  const [partySize, setPartySize] = useState('2');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isRegister = mode === 'register';

  const showFeedback = (message: string, error: boolean) => {
    setFeedback(message);
    setIsError(error);
  };

  const submit = async () => {
    Keyboard.dismiss();
    setFeedback(null);

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedName = displayName.trim();
    const normalizedLuggageCount = getLuggageCount(luggageCount);
    const normalizedSimCardCount = getSimCardCount(simCardCount);
    const normalizedPartySize =
      accountCoverage === 'family' ? getPartySize(partySize, 2) : 1;

    if (!normalizedEmail.includes('@') || !normalizedEmail.includes('.')) {
      showFeedback(t('auth.validation.email'), true);
      return;
    }

    if (isRegister && normalizedName.length < 2) {
      showFeedback(t('auth.validation.name'), true);
      return;
    }

    if (isRegister && !memberType) {
      showFeedback(t('auth.validation.memberType'), true);
      return;
    }

    if (isRegister && !accountCoverage) {
      showFeedback(t('auth.validation.accountCoverage'), true);
      return;
    }

    if (isRegister && accountCoverage === 'family' && normalizedPartySize === null) {
      showFeedback(t('family.validation.partySize'), true);
      return;
    }

    if (isRegister && normalizedLuggageCount === null) {
      showFeedback(t('luggage.validation.count'), true);
      return;
    }

    if (isRegister && normalizedSimCardCount === null) {
      showFeedback(t('simCards.validation.count'), true);
      return;
    }

    if (!isRegister && password.length === 0) {
      showFeedback(t('auth.validation.passwordRequired'), true);
      return;
    }

    if (isRegister && password.length < 8) {
      showFeedback(t('auth.validation.password'), true);
      return;
    }

    if (isRegister && (!/\p{L}/u.test(password) || !/\p{N}/u.test(password))) {
      showFeedback(t('auth.validation.passwordPattern'), true);
      return;
    }

    if (isRegister && password !== passwordConfirmation) {
      showFeedback(t('auth.validation.passwordMatch'), true);
      return;
    }

    setIsSubmitting(true);

    try {
      if (isRegister) {
        if (!memberType) {
          showFeedback(t('auth.validation.memberType'), true);
          return;
        }

        const result = await signUp(
          normalizedName,
          normalizedEmail,
          password,
          memberType,
          normalizedPartySize ?? 1,
          normalizedLuggageCount ?? 0,
          normalizedSimCardCount ?? 0,
        );

        if (result.error) {
          showFeedback(result.error.message, true);
        } else {
          completeOnboarding();

          if (result.requiresEmailConfirmation) {
            setPassword('');
            setPasswordConfirmation('');
            showFeedback(t('auth.success.checkEmail'), false);
          }
        }
      } else {
        const result = await signIn(normalizedEmail, password);

        if (result.error) {
          showFeedback(result.error.message, true);
        } else {
          completeOnboarding();
        }
      }
    } catch (error) {
      const message = getOriginalErrorMessage(error);

      if (message) {
        showFeedback(message, true);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const switchMode = () => {
    setFeedback(null);
    router.replace(isRegister ? loginRoute(returnTo) : registerRoute(returnTo));
  };

  const continueWithoutAccount = () => {
    completeOnboarding();
    router.replace('/');
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}>
        <TouchableWithoutFeedback accessible={false} onPress={Keyboard.dismiss}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled">
            <View
              style={[
                styles.container,
                { width: Math.max(0, Math.min(MaxContentWidth, 480, width - Spacing.three * 2)) },
              ]}>
            <View style={styles.intro}>
              <ThemedText type="eyebrow" themeColor="accent">
                Shia Ziyarah Iraq
              </ThemedText>
              <ThemedText type="title">
                {t(isRegister ? 'auth.registerTitle' : 'auth.loginTitle')}
              </ThemedText>
              <ThemedText themeColor="textSecondary">
                {t(isRegister ? 'auth.registerBody' : 'auth.loginBody')}
              </ThemedText>
            </View>

            <ThemedView type="surface" style={[styles.card, { borderColor: theme.border }]}>
              {isRegister ? (
                <>
                  <View style={styles.field}>
                    <ThemedText type="smallBold">{t('auth.name')}</ThemedText>
                    <TextInput
                      autoCapitalize="words"
                      autoComplete="name"
                      editable={!isSubmitting}
                      maxLength={80}
                      onChangeText={setDisplayName}
                      placeholder={t('auth.namePlaceholder')}
                      placeholderTextColor={theme.textSecondary}
                      style={[
                        styles.input,
                        {
                          backgroundColor: theme.background,
                          borderColor: theme.border,
                          color: theme.text,
                        },
                      ]}
                      textContentType="name"
                      value={displayName}
                    />
                  </View>

                  <View style={styles.field}>
                    <ThemedText type="smallBold">{t('auth.memberTypeTitle')}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {t('auth.memberTypeBody')}
                    </ThemedText>
                    <View accessibilityRole="radiogroup" style={styles.choiceRow}>
                      <RegistrationChoice
                        disabled={isSubmitting}
                        label={t('auth.memberType.brother')}
                        onPress={() => setMemberType('brother')}
                        selected={memberType === 'brother'}
                      />
                      <RegistrationChoice
                        disabled={isSubmitting}
                        label={t('auth.memberType.sister')}
                        onPress={() => setMemberType('sister')}
                        selected={memberType === 'sister'}
                      />
                    </View>
                  </View>

                  <View style={styles.field}>
                    <ThemedText type="smallBold">{t('auth.accountCoverageTitle')}</ThemedText>
                    <View accessibilityRole="radiogroup" style={styles.choiceList}>
                      <RegistrationChoice
                        description={t('auth.accountCoverage.individualBody')}
                        disabled={isSubmitting}
                        label={t('auth.accountCoverage.individual')}
                        onPress={() => setAccountCoverage('individual')}
                        selected={accountCoverage === 'individual'}
                      />
                      <RegistrationChoice
                        description={t('auth.accountCoverage.familyBody')}
                        disabled={isSubmitting}
                        label={t('auth.accountCoverage.family')}
                        onPress={() => setAccountCoverage('family')}
                        selected={accountCoverage === 'family'}
                      />
                    </View>
                  </View>

                  {accountCoverage === 'family' ? (
                    <PartySizeField
                      disabled={isSubmitting}
                      minimum={2}
                      onChange={setPartySize}
                      value={partySize}
                    />
                  ) : null}

                  <LuggageCountField
                    disabled={isSubmitting}
                    onChange={setLuggageCount}
                    value={luggageCount}
                  />

                  <SimCardCountField
                    disabled={isSubmitting}
                    onChange={setSimCardCount}
                    value={simCardCount}
                  />
                </>
              ) : null}

              <View style={styles.field}>
                <ThemedText type="smallBold">{t('auth.email')}</ThemedText>
                <TextInput
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect={false}
                  editable={!isSubmitting}
                  inputMode="email"
                  keyboardType="email-address"
                  maxLength={254}
                  onChangeText={setEmail}
                  placeholder={t('auth.emailPlaceholder')}
                  placeholderTextColor={theme.textSecondary}
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.background,
                      borderColor: theme.border,
                      color: theme.text,
                    },
                  ]}
                  textContentType="emailAddress"
                  value={email}
                />
              </View>

              <View style={styles.field}>
                <ThemedText type="smallBold">{t('auth.password')}</ThemedText>
                <TextInput
                  autoCapitalize="none"
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                  editable={!isSubmitting}
                  onChangeText={setPassword}
                  onSubmitEditing={isRegister ? undefined : () => void submit()}
                  placeholder="••••••••"
                  placeholderTextColor={theme.textSecondary}
                  secureTextEntry
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.background,
                      borderColor: theme.border,
                      color: theme.text,
                    },
                  ]}
                  textContentType={isRegister ? 'newPassword' : 'password'}
                  value={password}
                />
                {isRegister ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    {t('auth.passwordHint')}
                  </ThemedText>
                ) : null}
              </View>

              {!isRegister ? (
                <Pressable
                  accessibilityRole="link"
                  disabled={isSubmitting}
                  onPress={() => router.push(forgotPasswordRoute())}
                  style={({ pressed }) => [
                    styles.forgotPasswordLink,
                    pressed && styles.pressed,
                  ]}>
                  <ThemedText type="smallBold" themeColor="accent">
                    {t('auth.forgotPassword')}
                  </ThemedText>
                </Pressable>
              ) : null}

              {isRegister ? (
                <View style={styles.field}>
                  <ThemedText type="smallBold">{t('auth.passwordConfirm')}</ThemedText>
                  <TextInput
                    autoCapitalize="none"
                    autoComplete="new-password"
                    editable={!isSubmitting}
                    onChangeText={setPasswordConfirmation}
                    onSubmitEditing={() => void submit()}
                    placeholder="••••••••"
                    placeholderTextColor={theme.textSecondary}
                    secureTextEntry
                    style={[
                      styles.input,
                      {
                        backgroundColor: theme.background,
                        borderColor: theme.border,
                        color: theme.text,
                      },
                    ]}
                    textContentType="newPassword"
                    value={passwordConfirmation}
                  />
                </View>
              ) : null}

              {feedback ? (
                <View
                  accessibilityLiveRegion="polite"
                  style={[
                    styles.feedback,
                    {
                      backgroundColor: isError ? theme.dangerSoft : theme.successSoft,
                      borderColor: isError ? theme.danger : theme.success,
                    },
                  ]}>
                  <ThemedText type="small" themeColor={isError ? 'danger' : 'success'}>
                    {feedback}
                  </ThemedText>
                </View>
              ) : null}

              <Pressable
                accessibilityRole="button"
                accessibilityState={{ busy: isSubmitting, disabled: isSubmitting }}
                disabled={isSubmitting}
                onPress={() => void submit()}
                style={({ pressed }) => [
                  styles.submitButton,
                  { backgroundColor: theme.accent },
                  pressed && styles.pressed,
                  isSubmitting && styles.disabled,
                ]}>
                {isSubmitting ? (
                  <ActivityIndicator color={theme.background} />
                ) : (
                  <ThemedText type="smallBold" style={{ color: theme.background }}>
                    {t(isRegister ? 'auth.signUp' : 'auth.signIn')}
                  </ThemedText>
                )}
              </Pressable>

              {isRegister ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={isSubmitting}
                  onPress={continueWithoutAccount}
                  style={({ pressed }) => [
                    styles.guestButton,
                    {
                      backgroundColor: theme.backgroundElement,
                      borderColor: theme.border,
                    },
                    pressed && styles.pressed,
                    isSubmitting && styles.disabled,
                  ]}>
                  <ThemedText type="smallBold">
                    {t('auth.continueWithoutAccount')}
                  </ThemedText>
                </Pressable>
              ) : null}
            </ThemedView>

            <View style={styles.switchRow}>
              <ThemedText type="small" themeColor="textSecondary">
                {t(isRegister ? 'auth.haveAccount' : 'auth.noAccount')}
              </ThemedText>
              <Pressable
                accessibilityRole="link"
                disabled={isSubmitting}
                onPress={switchMode}
                style={({ pressed }) => pressed && styles.pressed}>
                <ThemedText type="smallBold" themeColor="accent">
                  {t(isRegister ? 'auth.signIn' : 'auth.signUp')}
                </ThemedText>
              </Pressable>
            </View>
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function RegistrationChoice({
  description,
  disabled,
  label,
  onPress,
  selected,
}: {
  description?: string;
  disabled: boolean;
  label: string;
  onPress: () => void;
  selected: boolean;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        {
          backgroundColor: selected ? theme.accentSoft : theme.background,
          borderColor: selected ? theme.accent : theme.border,
        },
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}>
      <View
        style={[
          styles.radio,
          { borderColor: selected ? theme.accent : theme.textSecondary },
        ]}>
        {selected ? <View style={[styles.radioDot, { backgroundColor: theme.accent }]} /> : null}
      </View>
      <View style={styles.choiceText}>
        <ThemedText type="smallBold">{label}</ThemedText>
        {description ? (
          <ThemedText type="small" themeColor="textSecondary">
            {description}
          </ThemedText>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    alignItems: 'center',
    flexGrow: 1,
    justifyContent: 'center',
    padding: Spacing.three,
  },
  container: {
    flexShrink: 1,
    gap: Spacing.four,
    marginHorizontal: 'auto',
    minWidth: 0,
  },
  intro: {
    gap: Spacing.two,
  },
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.three,
    minWidth: 0,
    padding: Spacing.four,
  },
  field: {
    gap: Spacing.two,
    minWidth: 0,
  },
  choiceRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  choiceList: {
    gap: Spacing.two,
  },
  choice: {
    alignItems: 'flex-start',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.two,
    minHeight: 52,
    minWidth: 0,
    padding: Spacing.three,
    paddingBottom: Spacing.four,
  },
  choiceText: {
    flex: 1,
    flexShrink: 1,
    gap: Spacing.half,
    minWidth: 0,
  },
  radio: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 2,
    height: 20,
    justifyContent: 'center',
    marginTop: 1,
    width: 20,
  },
  radioDot: {
    borderRadius: 999,
    height: 10,
    width: 10,
  },
  input: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 16,
    minHeight: 50,
    minWidth: 0,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    textAlign: 'left',
    writingDirection: 'ltr',
  },
  feedback: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
  },
  forgotPasswordLink: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    minHeight: 44,
  },
  submitButton: {
    alignItems: 'center',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: Spacing.three,
  },
  guestButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: Spacing.three,
  },
  switchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.6,
  },
});
