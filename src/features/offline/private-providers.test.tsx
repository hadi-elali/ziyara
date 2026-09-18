import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { GroupCheckProvider, useGroupCheck } from '@/features/group-check/group-check-context';
import {
  QuestionRoundProvider,
  useQuestionRound,
} from '@/features/question-round/question-round-context';
import { supabase } from '@/features/auth/supabase';
import {
  DailyProgramProvider,
  useDailyProgram,
} from '@/features/daily-program/daily-program-context';
import {
  TripGuidanceProvider,
  useTripGuidance,
} from '@/features/trip-guidance/trip-guidance-context';
import {
  BusManagementProvider,
  useBusManagement,
} from '@/features/bus-management/bus-management-context';
import {
  TripGroupProvider,
  useTripGroups,
} from '@/features/trip-groups/trip-group-context';

jest.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({
    hasProfileError: false,
    isAdmin: false,
    isLoading: false,
    profile: null,
    session: null,
  }),
}));

jest.mock('@/features/auth/supabase', () => ({
  supabase: {
    channel: jest.fn(),
    from: jest.fn(),
    removeChannel: jest.fn(),
  },
}));

const mockSupabase = supabase as unknown as {
  channel: jest.Mock;
  from: jest.Mock;
  removeChannel: jest.Mock;
};
const actEnvironmentGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
const originalActEnvironment = actEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT;
let renderer: ReactTestRenderer | null;
let providerState: {
  groupLoading: boolean;
  busLoading: boolean;
  dailyProgramLoading: boolean;
  guidanceLoading: boolean;
  questionLoading: boolean;
  tripGroupsLoading: boolean;
} | null;

function ProviderProbe() {
  const group = useGroupCheck();
  const bus = useBusManagement();
  const dailyProgram = useDailyProgram();
  const questions = useQuestionRound();
  const guidance = useTripGuidance();
  const tripGroups = useTripGroups();

  useEffect(() => {
    providerState = {
      groupLoading: group.isLoading,
      busLoading: bus.isLoading,
      dailyProgramLoading: dailyProgram.isLoading,
      guidanceLoading: guidance.isLoading,
      questionLoading: questions.isLoading,
      tripGroupsLoading: tripGroups.isLoading,
    };
  }, [
    bus.isLoading,
    dailyProgram.isLoading,
    group.isLoading,
    guidance.isLoading,
    questions.isLoading,
    tripGroups.isLoading,
  ]);

  return null;
}

describe('private providers without a session', () => {
  beforeAll(() => {
    actEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    renderer = null;
    providerState = null;
    jest.clearAllMocks();
  });

  afterEach(async () => {
    if (renderer) {
      await act(async () => renderer?.unmount());
    }
  });

  afterAll(() => {
    actEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  });

  it('führt für den öffentlichen Offline-Start keine Supabase-Abfrage aus', async () => {
    await act(async () => {
      renderer = create(
        <BusManagementProvider>
          <TripGroupProvider>
            <DailyProgramProvider>
              <TripGuidanceProvider>
                <GroupCheckProvider>
                  <QuestionRoundProvider>
                    <ProviderProbe />
                  </QuestionRoundProvider>
                </GroupCheckProvider>
              </TripGuidanceProvider>
            </DailyProgramProvider>
          </TripGroupProvider>
        </BusManagementProvider>,
      );
    });

    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    expect(mockSupabase.from).not.toHaveBeenCalled();
    expect(mockSupabase.channel).not.toHaveBeenCalled();
    expect(providerState).toEqual({
      busLoading: false,
      dailyProgramLoading: false,
      groupLoading: false,
      guidanceLoading: false,
      questionLoading: false,
      tripGroupsLoading: false,
    });
  });
});
