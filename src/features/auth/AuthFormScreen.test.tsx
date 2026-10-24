import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Text, TextInput } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Button } from '@/components/ui/button';
import { RegistrationFamilyFields } from './RegistrationFamilyFields';
import { AuthFormScreen } from './AuthFormScreen';
import { formatBirthDateInput, getAgeFromBirthDate, getBirthDate } from './birth-date';

const ownerAge = getAgeFromBirthDate('1994-01-01')!;
const childAge = getAgeFromBirthDate('2020-02-29')!;

const mockSignUp = jest.fn<(...args: unknown[]) => Promise<{
  error: { message: string } | null;
  requiresEmailConfirmation: boolean;
}>>();
const mockSignIn = jest.fn();
const mockCompleteOnboarding = jest.fn();
const mockT = (key: string, params?: Record<string, string | number>) =>
  params ? `${key}:${Object.values(params).join(':')}` : key;
jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() },
  useNavigation: () => ({ canGoBack: () => false }),
}));
jest.mock('expo-router/react-navigation', () => ({ useNavigationState: () => false }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual<typeof import('react-native')>('react-native').View }));
jest.mock('@/constants/theme', () => ({
  MaxContentWidth: 640,
  Spacing: { half: 2, one: 4, two: 8, three: 12, four: 16 },
}));
jest.mock('@/features/auth/auth-context', () => ({ useAuth: () => ({ signUp: mockSignUp, signIn: mockSignIn }) }));
jest.mock('@/features/onboarding/onboarding-state', () => ({ useOnboarding: () => ({ completeOnboarding: mockCompleteOnboarding }) }));
jest.mock('@/features/i18n/i18n', () => ({ useI18n: () => ({ t: mockT, isRTL: false }) }));
jest.mock('@/hooks/use-theme', () => ({ useTheme: () => ({ border: '#888', text: '#111', textSecondary: '#666', background: '#fff' }) }));
jest.mock('@/components/themed-text', () => ({ ThemedText: jest.requireActual<typeof import('react-native')>('react-native').Text }));
jest.mock('@/components/themed-view', () => ({ ThemedView: jest.requireActual<typeof import('react-native')>('react-native').View }));
jest.mock('@/components/ui/symbol-icon', () => ({ SymbolIcon: () => null }));
jest.mock('@/components/ui/button', () => {
  const { Pressable: MockPressable, Text: MockText } = jest.requireActual<typeof import('react-native')>('react-native');
  return { Button: ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled: boolean }) => (
    <MockPressable disabled={disabled} onPress={onPress}><MockText>{label}</MockText></MockPressable>
  ) };
});

let renderer: ReactTestRenderer;
const actGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousAct = actGlobal.IS_REACT_ACT_ENVIRONMENT;
const input = (label: string) => renderer.root.findAllByType(TextInput).find(node => node.props.accessibilityLabel === label)!;
const button = (label: string) => renderer.root.findAllByType(Button).find(node => node.props.label === label)!;
const hasText = (value: string) => renderer.root.findAllByType(Text).some(node => node.props.children === value);
async function choice(index: number) {
  await act(async () => {
    const choices = renderer.root.findAll(node => node.props.accessibilityRole === 'radio' && typeof node.props.onPress === 'function');
    choices[index].props.onPress();
  });
}
async function editMember(number: number, name: string, surname: string, birthDate = '29.02.2020', age?: string) {
  await act(async () => {
    input(`auth.familyMembers.fieldLabel:auth.firstName:${number}`).props.onChangeText(name);
    input(`auth.familyMembers.fieldLabel:auth.surname:${number}`).props.onChangeText(surname);
    input(`auth.familyMembers.fieldLabel:auth.familyMembers.birthDate:${number}`).props.onChangeText(birthDate);
    const isoDate = getBirthDate(formatBirthDateInput(birthDate));
    input(`auth.familyMembers.fieldLabel:auth.age:${number}`).props.onChangeText(age ?? String(isoDate ? getAgeFromBirthDate(isoDate) : 0));
  });
}
async function render(mode: 'login' | 'register' = 'register') {
  await act(async () => { renderer = create(<AuthFormScreen mode={mode} />); });
}
async function fillAccount() {
  await act(async () => {
    input('auth.firstName').props.onChangeText(' Eltern ');
    input('auth.surname').props.onChangeText(' Familie ');
    input('auth.birthDate').props.onChangeText('01.01.1994');
    input('auth.age').props.onChangeText(String(ownerAge));
    renderer.root.findAllByType(TextInput).find(node => node.props.placeholder === 'auth.emailPlaceholder')!.props.onChangeText(' family@example.com ');
    input('auth.password').props.onChangeText('Passwort123');
    input('auth.passwordConfirm').props.onChangeText('Passwort123');
  });
  await choice(0);
}
async function submit() {
  await act(async () => {
    await renderer.root.findAll(node =>
      node.props.accessibilityRole === 'button' && node.findAllByType(Text).some(text => text.props.children === 'auth.signUp'),
    )[0].props.onPress();
  });
}

describe('family registration', () => {
  beforeAll(() => { actGlobal.IS_REACT_ACT_ENVIRONMENT = true; });
  beforeEach(() => {
    jest.clearAllMocks();
    mockSignUp.mockResolvedValue({ error: null, requiresEmailConfirmation: true });
  });
  afterEach(async () => { await act(async () => renderer?.unmount()); });
  afterAll(() => { actGlobal.IS_REACT_ACT_ENVIRONMENT = previousAct; });

  it('shows the list only for family accounts and preserves names when adding, removing and switching', async () => {
    await render();
    expect(renderer.root.findAllByType(RegistrationFamilyFields)).toHaveLength(0);
    await choice(3);
    expect(button('auth.familyMembers.remove:1').props.disabled).toBe(true);
    await editMember(1, 'Erstes', 'Kind');
    await act(async () => { button('auth.familyMembers.add').props.onPress(); });
    await editMember(2, 'Zweites', 'Kind');
    await act(async () => { button('auth.familyMembers.add').props.onPress(); });
    await editMember(3, 'Drittes', 'Kind', '01.03.2021');
    await act(async () => { button('auth.familyMembers.remove:2').props.onPress(); });
    expect(input('auth.familyMembers.fieldLabel:auth.firstName:1').props.value).toBe('Erstes');
    expect(input('auth.familyMembers.fieldLabel:auth.firstName:2').props.value).toBe('Drittes');
    expect(input('auth.familyMembers.fieldLabel:auth.familyMembers.birthDate:2').props.value).toBe('01.03.2021');
    expect(input('auth.familyMembers.fieldLabel:auth.age:2').props.value).toBe(String(getAgeFromBirthDate('2021-03-01')));
    expect(hasText('auth.familyMembers.total:3')).toBe(true);
    await choice(2);
    expect(renderer.root.findAllByType(RegistrationFamilyFields)).toHaveLength(0);
    await choice(3);
    expect(input('auth.familyMembers.fieldLabel:auth.firstName:2').props.value).toBe('Drittes');
    expect(input('auth.familyMembers.fieldLabel:auth.familyMembers.birthDate:2').props.value).toBe('01.03.2021');
  });

  it('rejects missing member names, then sends trimmed names with the derived count', async () => {
    await render(); await fillAccount(); await choice(3);
    await editMember(1, ' Kind ', '   ');
    await submit();
    expect(mockSignUp).not.toHaveBeenCalled();
    expect(hasText('auth.familyMembers.validation')).toBe(true);
    await editMember(1, ' Kind ', ' Familie ');
    await act(async () => { button('auth.familyMembers.add').props.onPress(); });
    await editMember(2, 'Z', 'Anderer Name');
    await submit();
    expect(mockSignUp).toHaveBeenCalledWith('Eltern', 'Familie', ownerAge, 'family@example.com', 'Passwort123', 'brother', 3, 0, 0,
      [{ name: 'Kind', surname: 'Familie', birth_date: '2020-02-29', age: childAge }, { name: 'Z', surname: 'Anderer Name', birth_date: '2020-02-29', age: childAge }], '1994-01-01');
    expect(hasText('auth.success.checkEmail')).toBe(true);
  });

  it('submits only the owner when switched to individual, ignoring hidden member drafts', async () => {
    await render(); await fillAccount(); await choice(3);
    await editMember(1, 'Kind', 'Familie');
    await choice(2); await submit();
    expect(mockSignUp).toHaveBeenCalledWith('Eltern', 'Familie', ownerAge, 'family@example.com', 'Passwort123', 'brother', 1, 0, 0, [], '1994-01-01');
  });

  it('locks all family controls during signup and keeps drafts after a server error', async () => {
    let resolve!: (value: { error: { message: string }; requiresEmailConfirmation: boolean }) => void;
    mockSignUp.mockImplementation(() => new Promise(done => { resolve = done; }));
    await render(); await fillAccount(); await choice(3); await editMember(1, 'Kind', 'Familie');
    await act(async () => { input('auth.passwordConfirm').props.onSubmitEditing(); });
    expect(button('auth.familyMembers.add').props.disabled).toBe(true);
    expect(input('auth.familyMembers.fieldLabel:auth.firstName:1').props.editable).toBe(false);
    expect(input('auth.familyMembers.fieldLabel:auth.familyMembers.birthDate:1').props.editable).toBe(false);
    expect(input('auth.familyMembers.fieldLabel:auth.age:1').props.editable).toBe(false);
    expect(input('auth.birthDate').props.editable).toBe(false);
    expect(input('auth.age').props.editable).toBe(false);
    await act(async () => { resolve({ error: { message: 'Speichern fehlgeschlagen' }, requiresEmailConfirmation: false }); });
    expect(hasText('Speichern fehlgeschlagen')).toBe(true);
    expect(input('auth.familyMembers.fieldLabel:auth.firstName:1').props.value).toBe('Kind');
    expect(input('auth.familyMembers.fieldLabel:auth.familyMembers.birthDate:1').props.value).toBe('29.02.2020');
    expect(input('auth.familyMembers.fieldLabel:auth.age:1').props.value).toBe(String(childAge));
    expect(input('auth.birthDate').props.value).toBe('01.01.1994');
    expect(button('auth.familyMembers.add').props.disabled).toBe(false);
  });

  it('caps the list at 49 additional members', async () => {
    await render(); await choice(3);
    for (let index = 1; index < 49; index += 1) {
      await act(async () => { button('auth.familyMembers.add').props.onPress(); });
    }
    expect(button('auth.familyMembers.add').props.disabled).toBe(true);
    expect(hasText('auth.familyMembers.total:50')).toBe(true);
  });

  it.each(['', '29.02.2021', '31.04.2020', '01.01.9999'])('blocks registration with a missing or invalid birthday: %s', async birthDate => {
    await render(); await fillAccount(); await choice(3);
    await editMember(1, 'Kind', 'Familie', birthDate);
    await submit();
    expect(mockSignUp).not.toHaveBeenCalled();
    expect(hasText('auth.familyMembers.validation')).toBe(true);
  });

  it('formats numeric birthday input while typing', async () => {
    await render(); await choice(3); await editMember(1, 'Kind', 'Familie', '29022020');
    expect(input('auth.familyMembers.fieldLabel:auth.familyMembers.birthDate:1').props.value).toBe('29.02.2020');
  });

  it('keeps the login free of family inputs', async () => {
    await render('login');
    expect(renderer.root.findAllByType(RegistrationFamilyFields)).toHaveLength(0);
    expect(renderer.root.findAllByType(TextInput).some(node => node.props.accessibilityLabel === 'auth.birthDate')).toBe(false);
  });

  it.each([2, 3])('shows owner birthday and age for account coverage choice %i', async coverage => {
    await render(); await choice(coverage);
    expect(input('auth.birthDate').props.editable).toBe(true);
    expect(input('auth.age').props.editable).toBe(true);
    if (coverage === 3) {
      expect(input('auth.familyMembers.fieldLabel:auth.age:1').props.value).toBe('');
      expect(input('auth.familyMembers.fieldLabel:auth.familyMembers.birthDate:1').props.value).toBe('');
    }
  });

  it.each(['', '31.04.2000', '01.01.9999'])('requires a valid birthday for the owner: %s', async birthDate => {
    await render(); await fillAccount(); await choice(2);
    await act(async () => { input('auth.birthDate').props.onChangeText(birthDate); });
    await submit();
    expect(mockSignUp).not.toHaveBeenCalled();
    expect(hasText('auth.validation.birthDate')).toBe(true);
  });

  it.each([2, 3])('rejects inconsistent owner age for account coverage choice %i', async coverage => {
    await render(); await fillAccount(); await choice(coverage);
    await act(async () => { input('auth.age').props.onChangeText(String(ownerAge + 1)); });
    await submit();
    expect(mockSignUp).not.toHaveBeenCalled();
    expect(hasText('auth.validation.birthDateAge')).toBe(true);
  });

  it.each(['', '-1', '121', '1.5', String(childAge + 1)])('rejects missing, invalid or inconsistent family member age: %s', async age => {
    await render(); await fillAccount(); await choice(3);
    await editMember(1, 'Kind', 'Familie', '29.02.2020', age);
    await submit();
    expect(mockSignUp).not.toHaveBeenCalled();
    expect(hasText('auth.familyMembers.validation')).toBe(true);
  });
});
