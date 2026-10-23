import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Spacing } from '@/constants/theme';
import type { AdminPushMessage } from '@/domain/database';
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
  const [preview, setPreview] = useState<Pick<AdminPushMessage, 'id' | 'title' | 'body'> | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const prepare = async () => {
    if (busy.current) return;
    if (!title.trim() || !body.trim() || title.trim().length > 100 || body.trim().length > 500) {
      setError(t('adminPush.validation'));
      return;
    }
    busy.current = true;
    setWorking(true);
    setError(null);
    setFeedback(null);
    try {
      const result = await supabase.rpc('admin_prepare_push_message', {
        p_title: title.trim(), p_body: body.trim(),
      });
      if (result.error) throw result.error;
      if (!mounted.current) return;
      setPreview({
        id: result.data, title: title.trim(), body: body.trim(),
      });
    } catch (cause) {
      if (mounted.current) setError(getOriginalErrorMessage(cause) ?? t('adminPush.prepareError'));
    } finally {
      busy.current = false;
      if (mounted.current) setWorking(false);
    }
  };

  const send = async () => {
    if (busy.current || !preview) return;
    busy.current = true;
    setWorking(true);
    setError(null);
    setFeedback(null);
    try {
      const { data, error: dispatchError } = await supabase.functions.invoke<{ code: string }>(
        'dispatch-admin-push', { body: { messageId: preview.id } },
      );
      if (dispatchError || data?.code !== 'processed') throw dispatchError ?? new Error(t('adminPush.sendError'));
      if (!mounted.current) return;
      setPreview(null);
      setTitle('');
      setBody('');
      setFeedback(t('adminPush.processed'));
    } catch (cause) {
      if (mounted.current) {
        setError(`${t('adminPush.sendError')} ${getOriginalErrorMessage(cause) ?? ''}`.trim());
      }
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
        <ThemedText type="heading">{t(preview ? 'adminPush.preview' : 'adminPush.compose')}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">{t('adminPush.audience')}</ThemedText>
        {preview ? (
          <>
            <ThemedText type="smallBold">{preview.title}</ThemedText>
            <ThemedText>{preview.body}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{t('adminPush.confirm')}</ThemedText>
            <Button disabled={working} icon="alarm" label={t(working ? 'adminPush.sending' : 'adminPush.send')} onPress={() => void send()} />
            <Button disabled={working} icon="close" label={t('adminPush.cancel')} variant="secondary" onPress={() => { setPreview(null); setError(null); }} />
          </>
        ) : (
          <>
            <ThemedText type="smallBold">{t('adminPush.titleLabel')}</ThemedText>
            <TextInput accessibilityLabel={t('adminPush.titleLabel')} editable={!working} maxLength={100} onChangeText={setTitle} placeholder={t('adminPush.titlePlaceholder')} placeholderTextColor={theme.textSecondary} style={inputStyle} value={title} />
            <ThemedText type="smallBold">{t('adminPush.bodyLabel')}</ThemedText>
            <TextInput accessibilityLabel={t('adminPush.bodyLabel')} editable={!working} maxLength={500} multiline onChangeText={setBody} placeholder={t('adminPush.bodyPlaceholder')} placeholderTextColor={theme.textSecondary} style={[inputStyle, styles.messageInput]} textAlignVertical="top" value={body} />
            <ThemedText type="small" themeColor="textSecondary">{t('adminPush.limits', { title: title.length, body: body.length })}</ThemedText>
            <Button disabled={working || !title.trim() || !body.trim()} icon="alarm" label={t(working ? 'adminPush.preparing' : 'adminPush.review')} onPress={() => void prepare()} />
          </>
        )}
        {working ? <ActivityIndicator color={theme.accent} /> : null}
        {error ? <ThemedText accessibilityRole="alert" themeColor="danger">{error}</ThemedText> : null}
        {feedback ? <ThemedText accessibilityLiveRegion="polite" themeColor="success">{feedback}</ThemedText> : null}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: Spacing.three },
  input: { borderWidth: 1, borderRadius: 8, minHeight: 48, padding: Spacing.three, fontSize: 16 },
  messageInput: { minHeight: 120 },
});
