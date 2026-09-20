import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SymbolIcon } from '@/components/ui/symbol-icon';
import { Spacing } from '@/constants/theme';
import type { AccountFamily, AdminUserSummary } from '@/domain/database';
import { supabase } from '@/features/auth/supabase';
import { useI18n } from '@/features/i18n/i18n';
import { getOriginalErrorMessage } from '@/features/network/supabase-read';
import { useTheme } from '@/hooks/use-theme';

type FamilyFeedback =
  | { kind: 'deleted' | 'saved'; type: 'success' }
  | { message: string; type: 'error' }
  | null;

type AdminAccountFamilyPanelProps = {
  families: AccountFamily[];
  onChanged: () => Promise<void>;
  users: AdminUserSummary[];
};

export function AdminAccountFamilyPanel({
  families,
  onChanged,
  users,
}: AdminAccountFamilyPanelProps) {
  const theme = useTheme();
  const { language, t } = useI18n();
  const [editingFamilyId, setEditingFamilyId] = useState<number | null>(null);
  const [familyName, setFamilyName] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<FamilyFeedback>(null);
  const [isWorking, setIsWorking] = useState(false);

  const sortedUsers = useMemo(
    () =>
      [...users].sort((left, right) =>
        left.display_name.localeCompare(right.display_name, language),
      ),
    [language, users],
  );

  const resetEditor = () => {
    setEditingFamilyId(null);
    setFamilyName('');
    setSelectedUserIds(new Set());
  };

  const editFamily = (family: AccountFamily) => {
    setFeedback(null);
    setEditingFamilyId(family.id);
    setFamilyName(family.name);
    setSelectedUserIds(
      new Set(
        users
          .filter((user) => user.family_id === family.id)
          .map((user) => user.user_id),
      ),
    );
  };

  const toggleUser = (userId: string) => {
    setSelectedUserIds((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const saveFamily = async () => {
    if (isWorking || familyName.trim().length < 2 || selectedUserIds.size === 0) {
      return;
    }

    setFeedback(null);
    setIsWorking(true);

    try {
      const { error } = await supabase.rpc('admin_upsert_account_family', {
        p_family_id: editingFamilyId,
        p_member_user_ids: [...selectedUserIds],
        p_name: familyName.trim(),
      });

      if (error) {
        setFeedback({ message: error.message, type: 'error' });
        return;
      }

      resetEditor();
      setFeedback({ kind: 'saved', type: 'success' });
      await onChanged();
    } catch (error) {
      const message = getOriginalErrorMessage(error);
      if (message) setFeedback({ message, type: 'error' });
    } finally {
      setIsWorking(false);
    }
  };

  const deleteFamily = async (familyId: number) => {
    if (isWorking) return;
    setFeedback(null);
    setIsWorking(true);

    try {
      const { error } = await supabase.rpc('admin_delete_account_family', {
        p_family_id: familyId,
      });

      if (error) {
        setFeedback({ message: error.message, type: 'error' });
        return;
      }

      if (editingFamilyId === familyId) resetEditor();
      setFeedback({ kind: 'deleted', type: 'success' });
      await onChanged();
    } catch (error) {
      const message = getOriginalErrorMessage(error);
      if (message) setFeedback({ message, type: 'error' });
    } finally {
      setIsWorking(false);
    }
  };

  const confirmDelete = (family: AccountFamily) => {
    Alert.alert(
      t('accountFamilies.deleteTitle', { name: family.name }),
      t('accountFamilies.deleteBody'),
      [
        { style: 'cancel', text: t('accountFamilies.cancel') },
        {
          onPress: () => void deleteFamily(family.id),
          style: 'destructive',
          text: t('accountFamilies.deleteConfirm'),
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <Card style={styles.formCard}>
        <View style={styles.header}>
          <View style={styles.flexText}>
            <ThemedText type="heading">
              {t(
                editingFamilyId === null
                  ? 'accountFamilies.createTitle'
                  : 'accountFamilies.editTitle',
              )}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t('accountFamilies.editorBody')}
            </ThemedText>
          </View>
          {editingFamilyId !== null ? (
            <Button
              icon="close"
              label={t('accountFamilies.cancel')}
              onPress={resetEditor}
              style={[styles.cancelButton, { backgroundColor: theme.background }]}
              variant="secondary"
            />
          ) : null}
        </View>

        <View style={styles.field}>
          <ThemedText type="smallBold">{t('accountFamilies.name')}</ThemedText>
          <TextInput
            accessibilityLabel={t('accountFamilies.name')}
            editable={!isWorking}
            maxLength={80}
            onChangeText={setFamilyName}
            placeholder={t('accountFamilies.namePlaceholder')}
            placeholderTextColor={theme.textSecondary}
            style={[
              styles.input,
              {
                backgroundColor: theme.background,
                borderColor: theme.border,
                color: theme.text,
              },
            ]}
            value={familyName}
          />
        </View>

        <View style={styles.memberList}>
          <ThemedText type="smallBold">{t('accountFamilies.selectMembers')}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t('accountFamilies.selectMembersBody')}
          </ThemedText>
          {sortedUsers.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              {t('accountFamilies.noUsers')}
            </ThemedText>
          ) : (
            sortedUsers.map((user) => (
              <FamilyMemberChoice
                disabled={isWorking}
                key={user.user_id}
                label={user.display_name}
                note={
                  user.family_id !== null && user.family_id !== editingFamilyId
                    ? t('accountFamilies.currentFamily', {
                        name: user.family_name ?? t('accountFamilies.unknownFamily'),
                      })
                    : undefined
                }
                onPress={() => toggleUser(user.user_id)}
                selected={selectedUserIds.has(user.user_id)}
              />
            ))
          )}
        </View>

        <Button
          disabled={
            isWorking || familyName.trim().length < 2 || selectedUserIds.size === 0
          }
          icon={editingFamilyId === null ? 'plus' : 'confirm'}
          label={t(
            editingFamilyId === null
              ? 'accountFamilies.create'
              : 'accountFamilies.save',
          )}
          onPress={() => void saveFamily()}
          style={styles.submitButton}
        />
      </Card>

      {feedback ? (
        <Card
          style={[
            styles.feedback,
            {
              backgroundColor:
                feedback.type === 'error'
                  ? theme.dangerSoft
                  : theme.successSoft,
              borderColor:
                feedback.type === 'error'
                  ? theme.danger
                  : theme.success,
            },
          ]}>
          <ThemedText
            type="small"
            themeColor={feedback.type === 'error' ? 'danger' : 'success'}>
            {feedback.type === 'error'
              ? feedback.message
              : t(`accountFamilies.feedback.${feedback.kind}`)}
          </ThemedText>
        </Card>
      ) : null}

      {families.length === 0 ? (
        <Card style={styles.emptyCard}>
          <ThemedText type="heading">{t('accountFamilies.emptyTitle')}</ThemedText>
          <ThemedText themeColor="textSecondary">
            {t('accountFamilies.emptyBody')}
          </ThemedText>
        </Card>
      ) : (
        families.map((family) => {
          const members = users.filter((user) => user.family_id === family.id);

          return (
            <Card key={family.id} style={styles.familyCard}>
              <View style={styles.familyHeader}>
                <View style={styles.flexText}>
                  <ThemedText style={styles.familyName}>{family.name}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {t('accountFamilies.memberCount', { count: members.length })}
                  </ThemedText>
                </View>
              </View>

              <View style={styles.chips}>
                {members.length === 0 ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    {t('accountFamilies.noMembers')}
                  </ThemedText>
                ) : (
                  members.map((member) => (
                    <View
                      key={member.user_id}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: theme.background,
                          borderColor: theme.border,
                        },
                      ]}>
                      <ThemedText type="small">{member.display_name}</ThemedText>
                    </View>
                  ))
                )}
              </View>

              <View style={[styles.actions, { borderColor: theme.border }]}>
                <Button
                  disabled={isWorking}
                  icon="settings"
                  label={t('accountFamilies.edit')}
                  onPress={() => editFamily(family)}
                  style={[styles.actionButton, { backgroundColor: theme.background }]}
                  variant="secondary"
                />
                <Button
                  disabled={isWorking}
                  icon="close"
                  label={t('accountFamilies.delete')}
                  onPress={() => confirmDelete(family)}
                  style={styles.actionButton}
                  variant="danger"
                />
              </View>
            </Card>
          );
        })
      )}
    </View>
  );
}

function FamilyMemberChoice({
  disabled,
  label,
  note,
  onPress,
  selected,
}: {
  disabled: boolean;
  label: string;
  note?: string;
  onPress: () => void;
  selected: boolean;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="checkbox"
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
          styles.checkbox,
          {
            backgroundColor: selected ? theme.accent : theme.background,
            borderColor: selected ? theme.accent : theme.border,
          },
        ]}>
        {selected ? <SymbolIcon color={theme.background} name="confirm" size={14} /> : null}
      </View>
      <View style={styles.flexText}>
        <ThemedText type="small">{label}</ThemedText>
        {note ? (
          <ThemedText type="small" themeColor="textSecondary">
            {note}
          </ThemedText>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
  formCard: {
    borderRadius: 12,
    gap: Spacing.three,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    justifyContent: 'space-between',
  },
  flexText: {
    flex: 1,
    gap: Spacing.one,
    minWidth: 180,
  },
  field: {
    gap: Spacing.two,
  },
  input: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  memberList: {
    gap: Spacing.two,
  },
  cancelButton: {
    minHeight: 44,
  },
  submitButton: {
    alignSelf: 'flex-start',
    minWidth: 180,
  },
  choice: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: Spacing.two,
    minHeight: 52,
    padding: Spacing.two,
  },
  checkbox: {
    alignItems: 'center',
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  feedback: {
    gap: Spacing.one,
  },
  emptyCard: {
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 140,
    justifyContent: 'center',
  },
  familyCard: {
    borderRadius: 12,
    gap: Spacing.three,
  },
  familyHeader: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  familyName: {
    fontSize: 18,
    fontWeight: 600,
    lineHeight: 24,
  },
  actions: {
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    paddingTop: Spacing.three,
  },
  actionButton: {
    flex: 1,
    minWidth: 120,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  chip: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.5,
  },
});
