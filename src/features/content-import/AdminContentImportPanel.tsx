import { useFocusEffect, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, Pressable, StyleSheet, TextInput, View, type ScrollView } from 'react-native';
import { EnrichedMarkdownTextInput, type EnrichedMarkdownTextInputInstance } from 'react-native-enriched-markdown';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { allPlaces } from '@/data/places';
import type { ReligiousContentRecord } from '@/domain/database';
import type { TextParagraph } from '@/domain/types';
import { useAuth } from '@/features/auth/auth-context';
import { useI18n } from '@/features/i18n/i18n';
import { localizeCityName, localizePlace } from '@/features/i18n/localizedData';
import { getOriginalErrorMessage } from '@/features/network/supabase-read';
import { SegmentedReligiousText } from '@/features/reader/SegmentedReligiousText';
import { defaultReaderPreferences } from '@/features/storage/useReaderPreferences';
import { useTheme } from '@/hooks/use-theme';
import { emptyParagraph, importMixedText } from './import-text';
import { listReaderDrafts, newReaderDraft, readReaderDraft, saveReaderDraft, type ReaderDraft } from './reader-content-admin';
import { getReaderDraftError, slugFromTitle } from './reader-draft-validation';

const previewPreferences = { ...defaultReaderPreferences, translationLanguage: 'both' as const };
const pageSize = 10;

function importedSections(rawText: string) {
  const imported = importMixedText(rawText);
  return { paragraphs: imported.paragraphs, unresolved: [...new Set(imported.issues.map((issue) => issue.index))], parsedRaw: rawText };
}

type FieldProps = { label: string; value: string; onChange: (value: string) => void; disabled?: boolean; multiline?: boolean; ltr?: boolean; maxLength?: number };

function Field({ label, value, onChange, disabled, multiline, ltr, maxLength = 2000 }: FieldProps) {
  const theme = useTheme();
  const { isRTL } = useI18n();
  return <View style={styles.field}>
    <ThemedText type="smallBold">{label}</ThemedText>
    <TextInput accessibilityLabel={label} value={value} onChangeText={onChange} editable={!disabled}
      multiline={multiline} autoCapitalize="none" maxLength={maxLength} scrollEnabled={false}
      style={[styles.input, multiline && styles.multiline, { color: theme.text, borderColor: theme.border,
        backgroundColor: theme.surface, textAlign: !ltr && isRTL ? 'right' : 'left',
        writingDirection: !ltr && isRTL ? 'rtl' : 'ltr' }]} />
  </View>;
}

function RichField({ label, value, onChange, disabled, arabic, transliteration }: Omit<FieldProps, 'multiline'> & { arabic?: boolean; transliteration?: boolean }) {
  const theme = useTheme();
  const { t } = useI18n();
  const ref = useRef<EnrichedMarkdownTextInputInstance>(null);
  return <View style={styles.field}>
    <ThemedText type="smallBold">{label}</ThemedText>
    <View style={styles.actions}>
      <Button disabled={disabled} label={t('contentImport.bold')} variant="ghost" onPress={() => ref.current?.toggleBold()} />
      <Button disabled={disabled} label={t('contentImport.italic')} variant="ghost" onPress={() => ref.current?.toggleItalic()} />
    </View>
    <EnrichedMarkdownTextInput ref={ref} accessibilityLabel={label} defaultValue={transliteration ? value.replace(/`/g, '\\`') : value}
      writingDirection={arabic ? 'rtl' : 'ltr'}
      onChangeMarkdown={(markdown) => onChange(transliteration ? markdown.replace(/\\`/g, '`') : markdown)} editable={!disabled} multiline scrollEnabled={false}
      formatMenuConfig={{ bold: { label: t('contentImport.bold') }, italic: { label: t('contentImport.italic') },
        underline: { enabled: false }, strikethrough: { enabled: false }, spoiler: { enabled: false }, link: { enabled: false } }}
      style={[styles.input, styles.multiline, { color: theme.text, backgroundColor: theme.surface,
        borderColor: theme.border, writingDirection: arabic ? 'rtl' : 'ltr', textAlign: arabic ? 'right' : 'left' }]} />
  </View>;
}

function Choice({ label, selected, disabled, onPress }: { label: string; selected: boolean; disabled?: boolean; onPress: () => void }) {
  const theme = useTheme();
  return <Pressable accessibilityRole="checkbox" accessibilityLabel={label}
    accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={onPress}
    style={[styles.choice, { borderColor: selected ? theme.accent : theme.border, backgroundColor: selected ? theme.accentSoft : theme.surface }]}>
    <ThemedText type="small">{selected ? '✓ ' : ''}{label}</ThemedText>
  </Pressable>;
}

export function AdminContentImportPanel() {
  const navigation = useNavigation();
  const { profile } = useAuth();
  const { t, language } = useI18n();
  const theme = useTheme();
  const [rows, setRows] = useState<ReligiousContentRecord[]>([]);
  const [draft, setDraft] = useState<ReaderDraft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [city, setCity] = useState(allPlaces[0].city);
  const [page, setPage] = useState(0);
  const [editingBlock, setEditingBlock] = useState<number | null>(null);
  const [rawCollapsed, setRawCollapsed] = useState(false);
  const [previewCollapsed, setPreviewCollapsed] = useState(false);
  const sequence = useRef(0);
  const mutation = useRef(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const hasPreview = Boolean(draft?.paragraphs.length || draft?.parsedRaw);
  usePreventRemove(profile?.role === 'admin' && (dirty || busy), ({ data }) => {
    if (mutation.current) return;
    Alert.alert(t('contentImport.discardTitle'), t('contentImport.discardBody'), [
      { text: t('contentImport.keep'), style: 'cancel' },
      { text: t('contentImport.discard'), style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });

  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    setLoading(true); setError(null);
    try {
      const next = await listReaderDrafts();
      if (request === sequence.current) setRows(next);
    } catch (cause) {
      if (request === sequence.current) setError(getOriginalErrorMessage(cause));
    } finally {
      if (request === sequence.current) setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => {
    void refresh();
    return () => { sequence.current += 1; };
  }, [refresh]));

  const update = (change: Partial<ReaderDraft>) => {
    if (mutation.current) return;
    setDraft((current) => current ? { ...current, ...change } : null);
    setDirty(true); setMessage(null); setError(null);
  };
  const start = (next: ReaderDraft) => {
    setDraft(next); setDirty(false); setPage(0); setEditingBlock(null);
    setRawCollapsed(false); setPreviewCollapsed(false);
    setError(null); setMessage(null);
    setCity(allPlaces.find((place) => next.placeIds.includes(place.id))?.city ?? allPlaces[0].city);
  };
  const open = async (id: string) => {
    if (mutation.current) return;
    mutation.current = true; setBusy(true); setError(null);
    const request = sequence.current;
    try {
      const next = await readReaderDraft(id);
      if (request === sequence.current) start(next);
    } catch (cause) { if (request === sequence.current) setError(getOriginalErrorMessage(cause)); }
    finally { mutation.current = false; setBusy(false); }
  };
  const importText = () => {
    if (!draft) return;
    const run = () => {
      update(importedSections(draft.rawText));
      setPage(0); setEditingBlock(null); setPreviewCollapsed(false);
    };
    if (!hasPreview) run();
    else Alert.alert(t('contentImport.replaceTitle'), t('contentImport.replaceBody'), [
      { text: t('contentImport.keep'), style: 'cancel' }, { text: t('contentImport.replace'), onPress: run },
    ]);
  };
  const insert = (index: number, kind: TextParagraph['kind']) => {
    if (!draft) return;
    const paragraphs = [...draft.paragraphs]; paragraphs.splice(index, 0, emptyParagraph(kind));
    update({ paragraphs, unresolved: draft.unresolved.map((n) => n >= index ? n + 1 : n) });
    setPage(Math.floor(index / pageSize)); setEditingBlock(index);
  };
  const changeBlock = (index: number, change: Partial<TextParagraph>) => {
    if (draft) update({ paragraphs: draft.paragraphs.map((p, i) => i === index ? { ...p, ...change } : p),
      ...(change.kind && change.kind !== 'text' ? { unresolved: draft.unresolved.filter((n) => n !== index) } : {}) });
  };
  const remove = (index: number) => {
    if (!draft) return;
    update({ paragraphs: draft.paragraphs.filter((_, i) => i !== index),
      unresolved: draft.unresolved.filter((n) => n !== index).map((n) => n > index ? n - 1 : n) });
    setEditingBlock(null); setPage(0);
  };
  const move = (index: number, delta: number) => {
    if (!draft) return;
    const other = index + delta; const paragraphs = [...draft.paragraphs];
    [paragraphs[index], paragraphs[other]] = [paragraphs[other], paragraphs[index]];
    update({ paragraphs, unresolved: draft.unresolved.map((n) => n === index ? other : n === other ? index : n) });
    setEditingBlock(null); setPage(Math.floor(other / pageSize));
  };
  const save = async (publish: boolean) => {
    if (!draft || mutation.current) return;
    // Once created, the edited sections are authoritative. Only an explicit
    // re-import may replace them, even if later input events change the source.
    const needsImport = !hasPreview && Boolean(draft.rawText.trim());
    const prepared = needsImport ? { ...draft, ...importedSections(draft.rawText) } : draft;
    setMessage(null);
    if (needsImport) {
      update(prepared);
      setPage(0); setEditingBlock(null); setPreviewCollapsed(false);
    }
    const issue = getReaderDraftError(prepared, publish);
    if (issue) {
      if (issue.key === 'contentImport.reviewNeeded') {
        setPreviewCollapsed(false); setEditingBlock(null);
        setPage(Math.floor(prepared.unresolved[0] / pageSize));
      }
      setError(t(issue.key, issue.params)); return;
    }
    mutation.current = true; setBusy(true); setError(null);
    const request = ++sequence.current;
    setLoading(false);
    try {
      const saved = await saveReaderDraft(prepared, publish);
      if (request === sequence.current) {
        setRows((current) => [saved, ...current.filter((row) => row.id !== saved.id)]);
        start(newReaderDraft());
        setMessage(t('contentImport.saved'));
        Keyboard.dismiss();
        scrollViewRef.current?.scrollTo({ y: 0, animated: false });
      }
    } catch (cause) { if (request === sequence.current) setError(getOriginalErrorMessage(cause)); }
    finally { mutation.current = false; setBusy(false); }
  };

  return <Screen automaticallyAdjustKeyboardInsets scrollViewRef={scrollViewRef} safeAreaEdges={['left', 'right', 'bottom']} contentStyle={styles.screen}>
    {error ? <ThemedText accessibilityRole="alert" themeColor="danger">{error}</ThemedText> : null}
    {message ? <ThemedText accessibilityLiveRegion="polite" themeColor="success">{message}</ThemedText> : null}
    {!draft ? <>
      <Button label={t('contentImport.new')} disabled={busy} onPress={() => start(newReaderDraft())} />
      <Button icon="refresh" variant="secondary" label={t('admin.retry')} disabled={busy || loading} onPress={() => void refresh()} />
      {loading ? <ActivityIndicator accessibilityLabel={t('contentImport.loading')} color={theme.accent} /> : null}
      {!loading && !error && !rows.length ? <ThemedText>{t('contentImport.empty')}</ThemedText> : null}
      {rows.map((row) => <Card key={row.id}>
        <ThemedText type="heading">{row.title}</ThemedText>
        <ThemedText type="small">{t(row.is_published ? 'contentImport.published' : 'contentImport.draft')}</ThemedText>
        <Button label={t('contentImport.edit')} disabled={busy} variant="secondary" onPress={() => void open(row.id)} />
      </Card>)}
    </> : <>
      <Field label={t('contentImport.name')} value={draft.title} disabled={busy} maxLength={200} onChange={(title) => {
        const slug = slugFromTitle(title);
        update({ title, ...(!draft.updatedAt && (draft.slug === draft.id || draft.slug === slugFromTitle(draft.title)) ? { slug: slug || draft.id } : {}) });
      }} />
      <Field label={t('contentImport.slug')} value={draft.slug} disabled={busy || Boolean(draft.updatedAt)} ltr maxLength={120} onChange={(slug) => update({ slug })} />
      <ThemedText type="heading">{t('contentImport.places')}</ThemedText>
      <View style={styles.actions}>{[...new Set(allPlaces.map((p) => p.city))].map((name) => <Choice key={name}
        label={localizeCityName(name, language)} selected={city === name} disabled={busy} onPress={() => setCity(name)} />)}</View>
      {allPlaces.filter((p) => p.city === city).map((p) => <Choice key={p.id} label={localizePlace(p, language).name}
        selected={draft.placeIds.includes(p.id)} disabled={busy}
        onPress={() => update({ placeIds: draft.placeIds.includes(p.id) ? draft.placeIds.filter((id) => id !== p.id) : [...draft.placeIds, p.id] })} />)}
      <Field label={t('contentImport.sourceUrl')} value={draft.sourceUrl} disabled={busy} ltr onChange={(sourceUrl) => update({ sourceUrl })} />
      <ThemedText type="small" themeColor="textSecondary">{t('contentImport.rawHelp')}</ThemedText>
      <Button label={t(rawCollapsed ? 'contentImport.expandRaw' : 'contentImport.collapseRaw')}
        variant="ghost" disabled={busy} accessibilityState={{ expanded: !rawCollapsed }} onPress={() => setRawCollapsed(!rawCollapsed)} />
      {!rawCollapsed ? <Field label={t('contentImport.raw')} value={draft.rawText} disabled={busy} multiline maxLength={2000000} onChange={(rawText) => update({ rawText })} /> : null}
      <Button label={t(hasPreview ? 'contentImport.reimport' : 'contentImport.import')} variant={hasPreview ? 'secondary' : 'primary'}
        disabled={busy || !draft.rawText.trim()} onPress={importText} />
      <ThemedText type="heading">{t('contentImport.preview', { count: draft.paragraphs.length })}</ThemedText>
      <Button label={t(previewCollapsed ? 'contentImport.expandPreview' : 'contentImport.collapsePreview')}
        variant="ghost" disabled={busy} accessibilityState={{ expanded: !previewCollapsed }} onPress={() => setPreviewCollapsed(!previewCollapsed)} />
      {!previewCollapsed ? <>
      <View style={styles.actions}>
        <Button label={t('contentImport.addIntro')} variant="secondary" disabled={busy} onPress={() => insert(0, 'introduction')} />
        <Button label={t('contentImport.addText')} variant="secondary" disabled={busy} onPress={() => insert(draft.paragraphs.length, 'text')} />
      </View>
      {draft.paragraphs.slice(page * pageSize, (page + 1) * pageSize).map((paragraph, offset) => {
        const index = page * pageSize + offset;
        const needsReview = draft.unresolved.includes(index);
        return <View key={index} style={styles.block}>
          <ThemedText type="smallBold">{t('contentImport.block', { number: index + 1 })}</ThemedText>
          {needsReview ? <ThemedText themeColor="warning">{t('contentImport.reviewBlock')}</ThemedText> : null}
          <SegmentedReligiousText paragraphs={[paragraph]} preferences={previewPreferences} />
          <Button label={t('contentImport.edit')} variant="secondary" disabled={busy} onPress={() => setEditingBlock(editingBlock === index ? null : index)} />
          {editingBlock === index ? <View style={styles.block}>
            <View style={styles.actions}>{(['text', 'introduction', 'heading', 'note'] as const).map((kind) => <Choice key={kind}
              label={t(`contentImport.kind.${kind}`)} selected={(paragraph.kind ?? 'text') === kind} disabled={busy}
              onPress={() => changeBlock(index, { kind })} />)}</View>
            {(['arabic', 'transliteration', 'translation_de', 'translation_en'] as const).map((field) => <RichField
              key={`${draft.id}-${index}-${field}`} label={t(`contentImport.${{ arabic: 'arabic', transliteration: 'transliteration', translation_de: 'de', translation_en: 'en' }[field]}`)}
              arabic={field === 'arabic'} transliteration={field === 'transliteration'} value={paragraph[field] ?? ''} disabled={busy} onChange={(value) => changeBlock(index, { [field]: value })} />)}
            <View style={styles.actions}>
              <Button label={t('contentImport.up')} variant="ghost" disabled={busy || index === 0} onPress={() => move(index, -1)} />
              <Button label={t('contentImport.down')} variant="ghost" disabled={busy || index === draft.paragraphs.length - 1} onPress={() => move(index, 1)} />
              <Button label={t('contentImport.remove')} variant="ghost" disabled={busy} onPress={() => remove(index)} />
            </View>
          </View> : null}
          {needsReview ? <Button label={t('contentImport.resolve')} variant="secondary" disabled={busy}
            onPress={() => update({ unresolved: draft.unresolved.filter((n) => n !== index) })} /> : null}
          <Button label={t('contentImport.addNote')} variant="ghost" disabled={busy} onPress={() => insert(index + 1, 'note')} />
        </View>;
      })}
      <View style={styles.actions}>
        <Button label={t('contentImport.previous')} variant="secondary" disabled={busy || page === 0} onPress={() => { setPage(page - 1); setEditingBlock(null); }} />
        <Button label={t('contentImport.next')} variant="secondary" disabled={busy || (page + 1) * pageSize >= draft.paragraphs.length}
          onPress={() => { setPage(page + 1); setEditingBlock(null); }} />
      </View>
      </> : null}
      <Button label={t(busy ? 'contentImport.saving' : draft.wasPublished ? 'contentImport.unpublish' : 'contentImport.saveDraft')}
        variant="secondary" disabled={busy} onPress={() => void save(false)} />
      <Button label={t('contentImport.publish')} disabled={busy} onPress={() => void save(true)} />
      {error ? <ThemedText accessibilityRole="alert" themeColor="danger">{error}</ThemedText> : null}
      {message ? <ThemedText accessibilityLiveRegion="polite" themeColor="success">{message}</ThemedText> : null}
    </>}
  </Screen>;
}

const styles = StyleSheet.create({
  screen: { gap: Spacing.three }, field: { gap: Spacing.two }, block: { gap: Spacing.two },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 10, padding: Spacing.three, fontSize: 16 },
  multiline: { minHeight: 100, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  choice: { borderWidth: 1, borderRadius: 10, padding: Spacing.two, minHeight: 44, justifyContent: 'center' },
});
