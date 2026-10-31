import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Switch, TextInput } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import type { DailyProgram, DailyProgramInput } from '@/domain/database';
import { AdminDailyProgramPanel } from '@/features/daily-program/AdminDailyProgramPanel';
import { DailyProgramOverview } from '@/features/daily-program/DailyProgramOverview';
import { dailyProgramDateRange } from '@/features/daily-program/daily-program-state';

let mockPrograms: DailyProgram[] = [];
let mockIsAdmin = true;
type RpcArgs = { p_programs: DailyProgramInput[] } | { p_item_id: number; p_scheduled_at: string | null; p_send_now: boolean };
const mockRpc = jest.fn<
  (name: string, args: RpcArgs) =>
    Promise<{ error: { message: string } | null }>
>();
const mockRefresh = jest.fn(async () => {});

jest.mock('@/features/auth/auth-context', () => ({ useAuth: () => ({ isAdmin: mockIsAdmin }) }));
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
  useI18n: () => ({ language: 'de', isRTL: false, t: (key: string, params?: { date?: string; count?: number }) => params?.date ? `${key}:${params.date}:${params.count}` : key }),
}));
jest.mock('@/hooks/use-theme', () => ({ useTheme: () => ({ accent: '#127456' }) }));
jest.mock('@/constants/theme', () => ({
  Spacing: { half: 2, one: 4, two: 8, three: 16, four: 24 },
}));
jest.mock('@/components/themed-text', () => ({ ThemedText: 'Text' }));
jest.mock('@/components/ui/card', () => ({ Card: 'View' }));
jest.mock('@/components/ui/screen', () => ({ Screen: 'View' }));
jest.mock('@/components/ui/symbol-icon', () => ({ SymbolIcon: () => null }));
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

function clock(date: string, position = 0) {
  return renderer!.root.findAll((node) =>
    node.props.accessibilityLabel === `dailyProgram.admin.pushConfigure:${date}:${position + 1}` &&
    typeof node.props.onPress === 'function',
  )[0];
}

async function mountOverview() {
  await act(async () => { renderer = create(<DailyProgramOverview />); });
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
    items: [{ id: (index + 1) * 10 + 1, program_id: index + 1, position: 0,
      details: `08:00 Ablauf ${index + 1}`, push_scheduled_at: null, push_started_at: null }],
    push_scheduled_at: null,
    push_started_at: null,
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
    mockIsAdmin = true;
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
    if (!('p_programs' in args)) throw new Error('Program payload expected');
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

  it('bietet beim Erstellen keine Push-Einstellungen an', async () => {
    await mountEditor();
    expect(renderer!.root.findAllByType(Switch)).toHaveLength(0);
    expect(inputs('dailyProgram.admin.pushDate')).toHaveLength(0);
  });

  it('öffnet je Unterpunkt eine Uhr und speichert nur dessen Push-Termin in UTC', async () => {
    mockPrograms = publishedPrograms(2);
    await mountOverview();
    expect(inputs('dailyProgram.admin.pushDate')).toHaveLength(0);
    expect(clock('2026-12-30')).toBeDefined();
    expect(clock('2026-12-31')).toBeDefined();
    await act(async () => { clock('2026-12-31').props.onPress(); });
    await act(async () => { renderer!.root.findByType(Switch).props.onValueChange(true); });
    expect(inputs('dailyProgram.admin.pushDate')[0].props.value).toBe('2026-12-30');
    await act(async () => { inputs('dailyProgram.admin.pushDate')[0].props.onChangeText('2026-12-31'); });
    await act(async () => { inputs('dailyProgram.admin.pushTime')[0].props.onChangeText('00:30'); });
    await act(async () => { await button('dailyProgram.admin.pushSave').props.onPress(); });
    expect(mockRpc).toHaveBeenCalledWith('admin_schedule_daily_program_item_push', {
      p_item_id: 21, p_scheduled_at: new Date(2026, 11, 31, 0, 30).toISOString(), p_send_now: false,
    });
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it('zeigt Reisenden keine Uhr und keinen Push-Editor', async () => {
    mockIsAdmin = false;
    mockPrograms = publishedPrograms(2);
    await mountOverview();
    expect(clock('2026-12-30')).toBeUndefined();
    expect(renderer!.root.findAllByType(Switch)).toHaveLength(0);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('trennt gleichlautende Unterpunkte und plant nur die ausgewählte Zeile', async () => {
    const program = publishedPrograms(1)[0];
    mockPrograms = [{ ...program, details: 'Aussaß\nAussaß', items: [
      { ...program.items[0], details: 'Aussaß' },
      { ...program.items[0], id: 12, position: 1, details: 'Aussaß' },
    ] }];
    await mountOverview();
    expect(clock('2026-12-30', 0)).toBeDefined();
    expect(clock('2026-12-30', 1)).toBeDefined();
    await act(async () => { clock('2026-12-30', 1).props.onPress(); });
    await act(async () => { renderer!.root.findByType(Switch).props.onValueChange(true); });
    expect(inputs('dailyProgram.admin.pushTime')[0].props.value).toBe('12:00');
    expect(button('dailyProgram.admin.pushSave').props.disabled).toBe(false);
    await act(async () => { await button('dailyProgram.admin.pushSave').props.onPress(); });
    expect(mockRpc).toHaveBeenCalledWith('admin_schedule_daily_program_item_push', {
      p_item_id: 12, p_scheduled_at: new Date(2026, 11, 30, 12).toISOString(), p_send_now: true,
    });
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it('folgt der aktuellen lokalen Minute bis zur manuellen Auswahl', async () => {
    mockPrograms = publishedPrograms(1);
    await mountOverview();
    await act(async () => { clock('2026-12-30').props.onPress(); });
    await act(async () => { renderer!.root.findByType(Switch).props.onValueChange(true); });
    expect(inputs('dailyProgram.admin.pushTime')[0].props.value).toBe('12:00');
    await act(async () => { jest.advanceTimersByTime(60_000); });
    expect(inputs('dailyProgram.admin.pushTime')[0].props.value).toBe('12:01');
    await act(async () => { inputs('dailyProgram.admin.pushTime')[0].props.onChangeText('15:00'); });
    await act(async () => { jest.advanceTimersByTime(60_000); });
    expect(inputs('dailyProgram.admin.pushTime')[0].props.value).toBe('15:00');
  });

  it('zeigt für einen noch nicht veröffentlichten Tag keine Uhr', async () => {
    await mountOverview();
    expect(clock('2026-12-30')).toBeUndefined();
  });

  it('weist ungültige und vergangene Push-Termine im geöffneten Tagesprogramm ab', async () => {
    mockPrograms = publishedPrograms(1);
    await mountOverview();
    await act(async () => { clock('2026-12-30').props.onPress(); });
    await act(async () => { renderer!.root.findByType(Switch).props.onValueChange(true); });
    const invalidTimes = [['2026-02-30', '10:00'], ['2026-12-29', '23:00'], ['2027-01-01', '25:00']];
    if (Intl.DateTimeFormat().resolvedOptions().timeZone === 'Europe/Berlin') {
      invalidTimes.push(['2027-03-28', '02:30']);
    }
    for (const [date, time] of invalidTimes) {
      await act(async () => {
        inputs('dailyProgram.admin.pushDate')[0].props.onChangeText(date);
        inputs('dailyProgram.admin.pushTime')[0].props.onChangeText(time);
      });
      expect(button('dailyProgram.admin.pushSave').props.disabled).toBe(true);
    }
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('lädt bestehende Termine und schaltet Push über die Uhr aus', async () => {
    mockPrograms = publishedPrograms(1).map((program) => ({
      ...program,
      items: program.items.map((item) => ({ ...item, push_scheduled_at: new Date(2026, 11, 30, 8).toISOString(), push_started_at: new Date(2026, 11, 30, 8).toISOString() })),
    }));
    await mountOverview();
    await act(async () => { clock('2026-12-30').props.onPress(); });
    expect(inputs('dailyProgram.admin.pushTime')[0].props.value).toBe('08:00');
    expect(button('dailyProgram.admin.pushSave').props.disabled).toBe(false);
    await act(async () => { await button('dailyProgram.admin.pushSave').props.onPress(); });
    expect(mockRpc).toHaveBeenLastCalledWith('admin_schedule_daily_program_item_push', {
      p_item_id: 11, p_scheduled_at: mockPrograms[0].items[0].push_scheduled_at, p_send_now: false,
    });
    await act(async () => { renderer!.root.findByType(Switch).props.onValueChange(false); });
    expect(inputs('dailyProgram.admin.pushTime')).toHaveLength(0);
    await act(async () => { await button('dailyProgram.admin.pushSave').props.onPress(); });
    expect(mockRpc).toHaveBeenLastCalledWith('admin_schedule_daily_program_item_push', {
      p_item_id: 11, p_scheduled_at: null, p_send_now: false,
    });
    await act(async () => { renderer!.root.findByType(Switch).props.onValueChange(true); });
    expect(inputs('dailyProgram.admin.pushTime')[0].props.value).toBe('12:00');
  });

  it('erhält den Push-Entwurf bei Fehlern und speichert beim Schließen nichts', async () => {
    mockPrograms = publishedPrograms(2);
    mockRpc.mockResolvedValueOnce({ error: { message: 'Verbindung unterbrochen' } });
    await mountOverview();
    await act(async () => { clock('2026-12-31').props.onPress(); });
    await act(async () => { renderer!.root.findByType(Switch).props.onValueChange(true); });
    await act(async () => { inputs('dailyProgram.admin.pushDate')[0].props.onChangeText('2026-12-31'); });
    await act(async () => { inputs('dailyProgram.admin.pushTime')[0].props.onChangeText('10:15'); });
    await act(async () => { await button('dailyProgram.admin.pushSave').props.onPress(); });
    expect(inputs('dailyProgram.admin.pushTime')[0].props.value).toBe('10:15');
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(renderer!.root.findAllByType(ThemedText).some((node) =>
      node.props.children === 'Verbindung unterbrochen',
    )).toBe(true);
    await act(async () => { renderer!.root.findAll((node) => node.props.accessibilityLabel === 'dailyProgram.admin.pushClose' && typeof node.props.onPress === 'function')[0].props.onPress(); });
    expect(inputs('dailyProgram.admin.pushTime')).toHaveLength(0);
    expect(mockRpc).toHaveBeenCalledTimes(1);
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
