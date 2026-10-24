import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Spacing } from '@/constants/theme';
import type { AdminPushAudience, AdminPushMessage } from '@/domain/database';
import { adminPushSendErrorMessage } from '@/features/admin/admin-push-error';
import { useAuth } from '@/features/auth/auth-context';
import { supabase } from '@/features/auth/supabase';
import { useI18n } from '@/features/i18n/i18n';
import { getOriginalErrorMessage } from '@/features/network/supabase-read';
import { useTheme } from '@/hooks/use-theme';

export function AdminPushPanel() {
  const { profile, session } = useAuth();
  if (profile?.role !== 'admin' || !session?.user.id) return null;
  return <PushComposer key={session.user.id} />;
}

function PushComposer() {
  const { t, isRTL } = useI18n();
  const theme = useTheme();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<AdminPushAudience>('all');
  const pendingMessage = useRef<Pick<AdminPushMessage, 'id' | 'title' | 'body' | 'audience'> | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const send = async () => {
    if (busy.current) return;
    const nextTitle = title.trim();
    const nextBody = body.trim();
    if (!nextTitle || !nextBody || nextTitle.length > 100 || nextBody.length > 500) {
      setError(t('adminPush.validation'));
      return;
    }
    busy.current = true;
    setWorking(true);
    setError(null);
    setFeedback(null);
    let dispatchStarted = false;
    try {
      let message = pendingMessage.current;
      if (!message || message.title !== nextTitle || message.body !== nextBody || message.audience !== audience) {
        const result = await supabase.rpc('admin_prepare_push_message', {
          p_title: nextTitle, p_body: nextBody, p_audience: audience,
        });
        if (result.error) throw result.error;
        if (!mounted.current) return;
        message = { id: result.data, title: nextTitle, body: nextBody, audience };
        pendingMessage.current = message;
      }
      // Reuse this ID while both text and audience remain unchanged.
      // Saving and dispatching happen within the same button action.
      dispatchStarted = true;
      const { data, error: dispatchError } = await supabase.functions.invoke<{ code: string }>(
        'dispatch-admin-push', { body: { messageId: message.id } },
      );
      if (dispatchError || data?.code !== 'processed') throw dispatchError ?? new Error(t('adminPush.sendError'));
      if (!mounted.current) return;
      pendingMessage.current = null;
      setTitle('');
      setBody('');
      setFeedback(t('adminPush.processed'));
    } catch (cause) {
      const message = dispatchStarted
        ? await adminPushSendErrorMessage(cause, t)
        : getOriginalErrorMessage(cause) ?? t('adminPush.prepareError');
      if (mounted.current) setError(message);
    } finally {
      busy.current = false;
      if (mounted.current) setWorking(false);
    }
  };

  const inputStyle = [styles.input, {
    backgroundColor: theme.backgroundElement, borderColor: theme.border, color: theme.text,
    textAlign: isRTL ? 'right' as const : 'left' as const,
    writingDirection: isRTL ? 'rtl' as const : 'ltr' as const,
  }];

  return (
    <View style={styles.stack}>
      <Card style={styles.stack}>
        <ThemedText type="heading">{t('adminPush.compose')}</ThemedText>
        <ThemedText type="smallBold">{t('adminPush.recipients')}</ThemedText>
        <View accessibilityRole="radiogroup" accessibilityLabel={t('adminPush.recipients')} style={[styles.audiences, isRTL && styles.rtl]}>
          {(['all', 'brother', 'sister'] as const).map((value) => (
            <Pressable
              key={value}
              accessibilityRole="radio"
              accessibilityLabel={t(`adminPush.${value}`)}
              accessibilityState={{ checked: audience === value, disabled: working }}
              disabled={working}
              onPress={() => setAudience(value)}
              style={[styles.audience, {
                backgroundColor: audience === value ? theme.accentSoft : theme.backgroundElement,
                borderColor: audience === value ? theme.accent : theme.border,
                borderWidth: audience === value ? 2 : 1,
                opacity: working ? 0.55 : 1,
              }]}>
              <ThemedText type="smallBold">{t(`adminPush.${value}`)}</ThemedText>
            </Pressable>
          ))}
        </View>
        <ThemedText type="small" themeColor="textSecondary">{t('adminPush.audience')}</ThemedText>
        <ThemedText type="smallBold">{t('adminPush.titleLabel')}</ThemedText>
        <TextInput accessibilityLabel={t('adminPush.titleLabel')} editable={!working} maxLength={100} onChangeText={setTitle} placeholder={t('adminPush.titlePlaceholder')} placeholderTextColor={theme.textSecondary} style={inputStyle} value={title} />
        <ThemedText type="smallBold">{t('adminPush.bodyLabel')}</ThemedText>
        <TextInput accessibilityLabel={t('adminPush.bodyLabel')} editable={!working} maxLength={500} multiline onChangeText={setBody} placeholder={t('adminPush.bodyPlaceholder')} placeholderTextColor={theme.textSecondary} style={[inputStyle, styles.messageInput]} textAlignVertical="top" value={body} />
        <ThemedText type="small" themeColor="textSecondary">{t('adminPush.limits', { title: title.length, body: body.length })}</ThemedText>
        <Button disabled={working || !title.trim() || !body.trim()} icon="alarm" label={t(working ? 'adminPush.sending' : audience === 'all' ? 'adminPush.send' : audience === 'brother' ? 'adminPush.sendBrothers' : 'adminPush.sendSisters')} onPress={() => void send()} />
        {working ? <ActivityIndicator color={theme.accent} /> : null}
        {error ? <ThemedText accessibilityRole="alert" themeColor="danger">{error}</ThemedText> : null}
        {feedback ? <ThemedText accessibilityLiveRegion="polite" themeColor="success">{feedback}</ThemedText> : null}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: Spacing.three },
  audiences: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  rtl: { flexDirection: 'row-reverse' },
  audience: { flexGrow: 1, flexBasis: 88, minHeight: 48, padding: Spacing.two, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  input: { borderWidth: 1, borderRadius: 8, minHeight: 48, padding: Spacing.three, fontSize: 16 },
  messageInput: { minHeight: 120 },
});
