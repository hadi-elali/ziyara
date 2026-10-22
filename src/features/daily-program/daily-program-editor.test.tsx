import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { TextInput } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import type { DailyProgram, DailyProgramInput } from '@/domain/database';
import { AdminDailyProgramPanel } from '@/features/daily-program/AdminDailyProgramPanel';
import { DailyProgramOverview } from '@/features/daily-program/DailyProgramOverview';
import { dailyProgramDateRange } from '@/features/daily-program/daily-program-state';

let mockPrograms: DailyProgram[] = [];
const mockRpc = jest.fn<
  (name: string, args: { p_programs: DailyProgramInput[] }) =>
    Promise<{ error: { message: string } | null }>
>();
const mockRefresh = jest.fn(async () => {});

jest.mock('@/features/auth/supabase', () => ({
  supabase: { rpc: (...args: Parameters<typeof mockRpc>) => mockRpc(...args) },
}));
jest.mock('@/features/daily-program/daily-program-context', () => ({
  useDailyProgram: () => ({
    programs: mockPrograms,
    hasProgramSnapshot: true,
    hasSyncError: false,
    isLoading: false,
    isRefreshing: false,
    refresh: mockRefresh,
    syncErrorMessage: null,
  }),
}));
jest.mock('@/features/i18n/i18n', () => ({
  useI18n: () => ({ language: 'de', isRTL: false, t: (key: string) => key }),
}));
jest.mock('@/hooks/use-theme', () => ({ useTheme: () => ({ accent: '#127456' }) }));
jest.mock('@/constants/theme', () => ({
  Spacing: { half: 2, one: 4, two: 8, three: 16, four: 24 },
}));
jest.mock('@/components/themed-text', () => ({ ThemedText: 'Text' }));
jest.mock('@/components/ui/card', () => ({ Card: 'View' }));
jest.mock('@/components/ui/screen', () => ({ Screen: 'View' }));
jest.mock('@/components/ui/button', () => ({ Button: () => null }));

const actGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousActEnvironment = actGlobal.IS_REACT_ACT_ENVIRONMENT;
let renderer: ReactTestRenderer | null = null;

function button(label: string) {
  return renderer!.root.findAllByType(Button).find((node) => node.props.label === label)!;
}

function inputs(label: string) {
  return renderer!.root.findAllByType(TextInput).filter(
    (node) => node.props.accessibilityLabel === label,
  );
}

async function mountEditor() {
  await act(async () => { renderer = create(<AdminDailyProgramPanel />); });
  await act(async () => { jest.runOnlyPendingTimers(); });
}

function publishedPrograms(count: number): DailyProgram[] {
  return dailyProgramDateRange('2026-12-30', count).map((date, index) => ({
    created_at: '2026-12-30T00:00:00.000Z',
    details: `08:00 Ablauf ${index + 1}`,
    id: index + 1,
    program_date: date,
    published_by_profile_id: 1,
    title: `Programm ${index + 1}`,
    updated_at: '2026-12-30T00:00:00.000Z',
  }));
}

describe('erweiterbares Tagesprogramm', () => {
  beforeAll(() => { actGlobal.IS_REACT_ACT_ENVIRONMENT = true; });
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 11, 30, 12));
    mockPrograms = [];
    mockRpc.mockReset().mockResolvedValue({ error: null });
    mockRefresh.mockClear();
  });
  afterEach(async () => {
    await act(async () => { renderer?.unmount(); });
    renderer = null;
    jest.useRealTimers();
  });
  afterAll(() => { actGlobal.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment; });

  it('ergänzt über vierzehn Tage ohne Eingabeverlust und speichert sie gemeinsam', async () => {
    await mountEditor();
    await act(async () => {
      inputs('dailyProgram.admin.title')[0].props.onChangeText('Erster Tag');
      inputs('dailyProgram.admin.details')[0].props.onChangeText('08:00 Frühstück');
    });
    for (let day = 1; day < 16; day += 1) {
      await act(async () => { button('dailyProgram.admin.addDay').props.onPress(); });
    }
    expect(inputs('dailyProgram.admin.details')).toHaveLength(16);
    expect(inputs('dailyProgram.admin.title')[0].props.value).toBe('Erster Tag');
    expect(inputs('dailyProgram.admin.details')[0].props.value).toBe('08:00 Frühstück');
    expect(button('dailyProgram.admin.saveMany').props.disabled).toBe(true);

    await act(async () => {
      inputs('dailyProgram.admin.details').slice(1).forEach((input) =>
        input.props.onChangeText('09:00 Abfahrt'),
      );
    });
    expect(button('dailyProgram.admin.saveMany').props.disabled).toBe(false);
    await act(async () => { await button('dailyProgram.admin.saveMany').props.onPress(); });
    expect(mockRpc).toHaveBeenCalledTimes(1);
    const [name, args] = mockRpc.mock.calls[0];
    expect(name).toBe('admin_upsert_daily_programs');
    expect(args.p_programs).toHaveLength(16);
    expect(args.p_programs[0]).toEqual({
      details: '08:00 Frühstück', program_date: '2026-12-30', title: 'Erster Tag',
    });
    expect(args.p_programs.at(-1)?.program_date).toBe('2027-01-14');
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    await act(async () => { jest.runOnlyPendingTimers(); });
    await act(async () => { button('dailyProgram.admin.addDay').props.onPress(); });
    expect(inputs('dailyProgram.admin.details')).toHaveLength(17);
    expect(inputs('dailyProgram.admin.details')[0].props.value).toBe('08:00 Frühstück');
  });

  it('nimmt einen leeren zusätzlichen Tag zurück und erhält den ersten Entwurf', async () => {
    await mountEditor();
    await act(async () => {
      inputs('dailyProgram.admin.details')[0].props.onChangeText('08:00 Frühstück');
    });
    await act(async () => { button('dailyProgram.admin.addDay').props.onPress(); });
    expect(button('dailyProgram.admin.saveMany').props.disabled).toBe(true);
    await act(async () => { button('dailyProgram.admin.removeLastDay').props.onPress(); });
    expect(inputs('dailyProgram.admin.details')).toHaveLength(1);
    expect(inputs('dailyProgram.admin.details')[0].props.value).toBe('08:00 Frühstück');
    expect(button('dailyProgram.admin.saveOne').props.disabled).toBe(false);
  });

  it('setzt nach erneutem Öffnen hinter dem letzten veröffentlichten Datum fort', async () => {
    mockPrograms = publishedPrograms(16);
    await mountEditor();
    expect(inputs('dailyProgram.admin.startDate')[0].props.value).toBe('2027-01-15');
    expect(renderer!.root.findAllByType(Button).filter(
      (node) => node.props.label === 'dailyProgram.admin.edit',
    )).toHaveLength(16);
  });

  it('erhält Eingaben bei fehlgeschlagenem Speichern und erlaubt einen neuen Versuch', async () => {
    mockRpc.mockResolvedValueOnce({ error: { message: 'Verbindung unterbrochen' } });
    await mountEditor();
    await act(async () => {
      inputs('dailyProgram.admin.details')[0].props.onChangeText('08:00 Frühstück');
    });
    await act(async () => { await button('dailyProgram.admin.saveOne').props.onPress(); });
    expect(inputs('dailyProgram.admin.details')[0].props.value).toBe('08:00 Frühstück');
    expect(renderer!.root.findAllByType(ThemedText).some(
      (node) => node.props.children === 'Verbindung unterbrochen',
    )).toBe(true);
    await act(async () => { await button('dailyProgram.admin.saveOne').props.onPress(); });
    expect(mockRpc).toHaveBeenCalledTimes(2);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it('lädt veröffentlichte Tage zum Bearbeiten und behält Änderungen beim Ergänzen', async () => {
    mockPrograms = publishedPrograms(2);
    await mountEditor();
    await act(async () => { button('dailyProgram.admin.edit').props.onPress(); });
    await act(async () => { jest.runOnlyPendingTimers(); });
    expect(inputs('dailyProgram.admin.startDate')[0].props.value).toBe('2026-12-30');
    await act(async () => {
      inputs('dailyProgram.admin.title')[0].props.onChangeText('Geänderte Überschrift');
    });
    await act(async () => { button('dailyProgram.admin.addDay').props.onPress(); });
    expect(inputs('dailyProgram.admin.title')[0].props.value).toBe('Geänderte Überschrift');
    expect(inputs('dailyProgram.admin.title')[1].props.value).toBe('Programm 2');
    expect(inputs('dailyProgram.admin.details')[1].props.value).toBe('08:00 Ablauf 2');
  });

  it('zeigt Reisenden sämtliche veröffentlichten Tage über die erste Woche hinaus', async () => {
    mockPrograms = publishedPrograms(16);
    await act(async () => { renderer = create(<DailyProgramOverview />); });
    const text = renderer!.root.findAllByType(ThemedText).map((node) => node.props.children);
    expect(text).toContain('Programm 1');
    expect(text).toContain('Programm 16');
    expect(text.filter((value) => typeof value === 'string' && value.startsWith('Programm ')))
      .toHaveLength(16);
  });

  it('zeigt ohne veröffentlichte Tage einen passenden Leerzustand für heute', async () => {
    await act(async () => { renderer = create(<DailyProgramOverview />); });
    const text = renderer!.root.findAllByType(ThemedText).map((node) => node.props.children);
    expect(text.filter((value) => value === 'dailyProgram.noProgramForDay')).toHaveLength(1);
  });
});
