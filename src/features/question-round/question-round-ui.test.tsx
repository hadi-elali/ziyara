import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { router } from 'expo-router';
import type { PropsWithChildren } from 'react';
import { ActivityIndicator, TextInput } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import QuestionRoundScreen from '@/app/question-round';
import { Button } from '@/components/ui/button';
import type { AnonymousQuestion, MemberType, QuestionRound } from '@/domain/database';
import { AdminQuestionRoundPanel } from '@/features/question-round/AdminQuestionRoundPanel';
import { canSubmitToQuestionRound as mockCanSubmitToQuestionRound } from '@/features/question-round/question-round-permissions';

let mockLatestRound: QuestionRound | null = null;
let mockMemberType: MemberType | null = 'brother';
const mockRpc = jest.fn<(...args: unknown[]) => Promise<{ data: QuestionRound | null; error: { message: string } | null }>>();
const mockSubmitQuestion = jest.fn<(...args: unknown[]) => Promise<{ error: null }>>();
type QuestionsResult = { data: AnonymousQuestion[] | null; error: { message: string } | null };
const mockLoadQuestions = jest.fn<() => Promise<QuestionsResult>>();
const mockQuestionOrder = jest.fn();
const mockRealtimeHandlers = new Map<string, () => void>();

jest.mock('expo-router', () => ({ router: { replace: jest.fn() }, Redirect: () => null }));
jest.mock('@/features/auth/RequireAuth', () => ({ RequireAuth: ({ children }: PropsWithChildren) => children }));
jest.mock('@/features/auth/auth-context', () => ({ useAuth: () => ({ profile: { member_type: mockMemberType } }) }));
jest.mock('@/features/auth/supabase', () => ({
  supabase: {
    functions: { invoke: jest.fn(async () => ({ data: { code: 'processed', pushFailed: false }, error: null })) },
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (table: string) => {
      const query = {
        select: () => query,
        order: (column: string, options: { ascending: boolean }) => {
          if (table === 'anonymous_questions') mockQuestionOrder(column, options);
          return query;
        },
        eq: () => query,
        limit: () => query,
        abortSignal: () => table === 'anonymous_questions' ? mockLoadQuestions() : query,
        maybeSingle: async () => ({ data: mockLatestRound, error: null }),
      };
      return query;
    },
    channel: () => {
      const channel = {
        on: (_event: string, filter: { table: string }, callback: () => void) => {
          mockRealtimeHandlers.set(filter.table, callback);
          return channel;
        },
        subscribe: () => channel,
      };
      return channel;
    },
    removeChannel: jest.fn(),
  },
}));
jest.mock('@/features/question-round/question-round-context', () => ({
  useQuestionRound: () => ({
    activeRound: mockLatestRound,
    canSubmitQuestion: mockCanSubmitToQuestionRound(mockLatestRound, mockMemberType),
    hasSyncError: false,
    isLoading: false,
    submitQuestion: mockSubmitQuestion,
  }),
}));
jest.mock('@/features/i18n/i18n', () => ({ useI18n: () => ({ t: (key: string) => key, isRTL: false }) }));
jest.mock('@/hooks/use-theme', () => ({ useTheme: () => ({ accent: '#127456' }) }));
jest.mock('@/constants/theme', () => ({ Spacing: { one: 4, two: 8, three: 16, four: 24 } }));
jest.mock('@/components/themed-text', () => ({ ThemedText: 'Text' }));
jest.mock('@/components/ui/card', () => ({ Card: 'View' }));
jest.mock('@/components/ui/screen', () => ({ Screen: 'View' }));
jest.mock('@/components/ui/button', () => ({ Button: () => null }));
jest.mock('@/components/ui/symbol-icon', () => ({ SymbolIcon: () => null }));

const round: QuestionRound = {
  id: 73,
  created_at: '2026-10-22T09:00:00Z',
  closed_at: null,
  target_member_type: 'brother',
};
const questions: AnonymousQuestion[] = [1, 2].map((id) => ({
  id,
  round_id: round.id,
  question: `Frage ${id}`,
  is_checked: false,
  created_at: `2026-11-11T09:00:0${id}Z`,
  checked_at: null,
}));
const actGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousActEnvironment = actGlobal.IS_REACT_ACT_ENVIRONMENT;
let renderer: ReactTestRenderer | null = null;

async function flushAsyncWork() {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe('Fragerundenoberfläche', () => {
  beforeAll(() => { actGlobal.IS_REACT_ACT_ENVIRONMENT = true; });
  beforeEach(() => {
    jest.clearAllMocks();
    mockLatestRound = null;
    mockMemberType = 'brother';
    mockRealtimeHandlers.clear();
    mockLoadQuestions.mockReset().mockResolvedValue({ data: questions, error: null });
    mockRpc.mockReset().mockResolvedValue({ data: round, error: null });
    mockSubmitQuestion.mockResolvedValue({ error: null });
  });

  describe('Abhaken und Live-Abgleich', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      mockLatestRound = round;
    });
    afterEach(() => { jest.useRealTimers(); });

    async function renderQuestions() {
      await act(async () => { renderer = create(<AdminQuestionRoundPanel />); });
      await act(async () => { await jest.advanceTimersByTimeAsync(1); });
      await act(async () => { await jest.advanceTimersByTimeAsync(1); });
    }

    function checkboxes() {
      return renderer!.root.findAllByProps({ accessibilityRole: 'checkbox' })
        .filter((item) => item.parent?.props.accessibilityRole !== 'checkbox');
    }

    async function refreshQuestions() {
      await act(async () => {
        mockRealtimeHandlers.get('anonymous_questions')!();
        await jest.advanceTimersByTimeAsync(250);
      });
    }

    it('behält die Fragen beim Abhaken und Live-Abgleich ohne Ladeanzeige an ihrer Position', async () => {
      await renderQuestions();
      const originalRows = checkboxes();
      await act(async () => { originalRows[0].props.onPress(); });
      expect(mockRpc).toHaveBeenCalledWith('set_anonymous_question_checked', {
        p_is_checked: true,
        p_question_id: questions[0].id,
      });

      let finishRead!: (result: QuestionsResult) => void;
      mockLoadQuestions.mockImplementationOnce(() => new Promise((resolve) => { finishRead = resolve; }));
      await refreshQuestions();
      expect(mockLoadQuestions).toHaveBeenCalledTimes(2);
      expect(checkboxes()).toEqual(originalRows);
      expect(checkboxes()[0].props.accessibilityState.checked).toBe(true);
      expect(renderer!.root.findAllByType(ActivityIndicator)).toHaveLength(0);

      await act(async () => { finishRead({
        data: [{ ...questions[0], is_checked: true }, questions[1]], error: null,
      }); });
      expect(checkboxes()).toEqual(originalRows);
      expect(mockQuestionOrder).not.toHaveBeenCalledWith('is_checked', expect.anything());
      expect(mockQuestionOrder).toHaveBeenCalledWith('created_at', { ascending: true });
      expect(mockQuestionOrder).toHaveBeenCalledWith('id', { ascending: true });

      await act(async () => { checkboxes()[0].props.onPress(); });
      expect(mockRpc).toHaveBeenLastCalledWith('set_anonymous_question_checked', {
        p_is_checked: false,
        p_question_id: questions[0].id,
      });
      expect(checkboxes()).toEqual(originalRows);
      expect(checkboxes()[0].props.accessibilityState.checked).toBe(false);
    });

    it('lässt einen bestätigten Haken nicht durch einen älteren Listenabruf zurückspringen', async () => {
      await renderQuestions();
      let finishRead!: (result: QuestionsResult) => void;
      mockLoadQuestions.mockImplementationOnce(() => new Promise((resolve) => { finishRead = resolve; }));
      await refreshQuestions();
      await act(async () => { checkboxes()[0].props.onPress(); });
      expect(checkboxes()[0].props.accessibilityState.checked).toBe(true);

      await act(async () => { finishRead({ data: questions, error: null }); });
      expect(checkboxes()[0].props.accessibilityState.checked).toBe(true);
      expect(renderer!.root.findAllByType(ActivityIndicator)).toHaveLength(0);
    });

    it('behält die Liste und den bisherigen Status bei Fehlern und erlaubt einen neuen Versuch', async () => {
      await renderQuestions();
      const originalRows = checkboxes();
      mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'Speichern fehlgeschlagen' } });
      await act(async () => { checkboxes()[0].props.onPress(); });
      expect(checkboxes()).toEqual(originalRows);
      expect(checkboxes()[0].props.accessibilityState).toMatchObject({ checked: false, disabled: false });
      expect(JSON.stringify(renderer!.toJSON())).toContain('Speichern fehlgeschlagen');

      mockLoadQuestions.mockResolvedValueOnce({ data: null, error: { message: 'Abgleich fehlgeschlagen' } });
      await refreshQuestions();
      expect(checkboxes()).toEqual(originalRows);
      expect(JSON.stringify(renderer!.toJSON())).toContain('Abgleich fehlgeschlagen');
      await act(async () => { checkboxes()[0].props.onPress(); });
      expect(checkboxes()[0].props.accessibilityState.checked).toBe(true);
    });

    it('zeigt den Ladeindikator beim ersten Laden und erhält danach auch eine leere Liste', async () => {
      let finishRead!: (result: QuestionsResult) => void;
      mockLoadQuestions.mockImplementationOnce(() => new Promise((resolve) => { finishRead = resolve; }));
      await renderQuestions();
      expect(renderer!.root.findAllByType(ActivityIndicator)).toHaveLength(1);
      await act(async () => { finishRead({ data: [], error: null }); });
      expect(JSON.stringify(renderer!.toJSON())).toContain('questionRound.empty');

      mockLoadQuestions.mockImplementationOnce(() => new Promise((resolve) => { finishRead = resolve; }));
      await refreshQuestions();
      expect(renderer!.root.findAllByType(ActivityIndicator)).toHaveLength(0);
      expect(JSON.stringify(renderer!.toJSON())).toContain('questionRound.empty');
      await act(async () => { finishRead({ data: questions, error: null }); });
      expect(checkboxes()).toHaveLength(2);
    });
  });
  afterEach(async () => { await act(async () => renderer?.unmount()); });
  afterAll(() => { actGlobal.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment; });

  it.each(['brother', 'sister'] as const)('verlangt eine Auswahl und öffnet explizit für %s', async (audience) => {
    mockRpc.mockResolvedValue({ data: { ...round, target_member_type: audience }, error: null });
    await act(async () => { renderer = create(<AdminQuestionRoundPanel />); });
    await act(flushAsyncWork);
    const root = renderer!.root;
    const openButton = () => root.findAllByType(Button).find((button) => button.props.label === 'questionRound.open')!;
    expect(openButton().props.disabled).toBe(true);
    await act(async () => { openButton().props.onPress(); });
    expect(mockRpc).not.toHaveBeenCalled();

    await act(async () => {
      root.findAllByProps({ accessibilityLabel: `questionRound.audience.${audience}` })[0].props.onPress();
    });
    expect(openButton().props.disabled).toBe(false);
    await act(async () => { openButton().props.onPress(); await flushAsyncWork(); });

    expect(mockRpc).toHaveBeenCalledWith('open_question_round', { p_audience: audience });
    expect(root.findAllByType(Button).some((button) => button.props.label === 'questionRound.close')).toBe(true);
  });

  it('behält die Zielgruppenauswahl und zeigt einen Serverfehler bei fehlgeschlagenem Öffnen', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Zugriff verweigert' } });
    await act(async () => { renderer = create(<AdminQuestionRoundPanel />); });
    await act(flushAsyncWork);
    const root = renderer!.root;
    await act(async () => {
      root.findAllByProps({ accessibilityLabel: 'questionRound.audience.brother' })[0].props.onPress();
    });
    await act(async () => {
      root.findAllByType(Button).find((button) => button.props.label === 'questionRound.open')!.props.onPress();
      await flushAsyncWork();
    });
    expect(JSON.stringify(renderer!.toJSON())).toContain('Zugriff verweigert');
    expect(root.findAllByProps({ accessibilityLabel: 'questionRound.audience.brother' })[0].props.accessibilityState.checked).toBe(true);
  });

  it.each<[MemberType | null, MemberType | null, string]>([
    ['brother', 'sister', 'questionRound.onlyBrothers'],
    ['sister', 'brother', 'questionRound.onlySisters'],
    ['brother', null, 'questionRound.memberTypeMissing'],
    [null, 'brother', 'questionRound.audienceMissing'],
  ])('sperrt den direkten Formularaufruf für Zielgruppe %s und Konto %s', async (audience, memberType, message) => {
    mockLatestRound = { ...round, target_member_type: audience };
    mockMemberType = memberType;
    await act(async () => { renderer = create(<QuestionRoundScreen />); });

    expect(renderer!.root.findAllByType(TextInput)).toHaveLength(0);
    expect(JSON.stringify(renderer!.toJSON())).toContain(message);
    expect(mockSubmitQuestion).not.toHaveBeenCalled();
    await act(async () => { renderer!.root.findByType(Button).props.onPress(); });
    expect(router.replace).toHaveBeenCalledWith('/');
  });

  it.each(['brother', 'sister'] as const)('erlaubt der passenden Zielgruppe %s eine anonyme Frage', async (audience) => {
    mockLatestRound = { ...round, target_member_type: audience };
    mockMemberType = audience;
    await act(async () => { renderer = create(<QuestionRoundScreen />); });
    const root = renderer!.root;
    await act(async () => { root.findByType(TextInput).props.onChangeText('Wann treffen wir uns?'); });
    await act(async () => { root.findByType(Button).props.onPress(); await flushAsyncWork(); });

    expect(mockSubmitQuestion).toHaveBeenCalledWith(round.id, 'Wann treffen wir uns?');
    expect(root.findByType(TextInput).props.value).toBe('');
    expect(JSON.stringify(renderer!.toJSON())).toContain('questionRound.submitSuccess');
  });
});
