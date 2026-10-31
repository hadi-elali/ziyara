import type { AppRole, MemberType, QuestionRound } from '@/domain/database';

export const questionRoundManagerRoles: readonly AppRole[] = ['admin', 'scholar'];

export function canSubmitToQuestionRound(
  round: QuestionRound | null,
  memberType: MemberType | null | undefined,
): boolean {
  return Boolean(
    round &&
      !round.closed_at &&
      (round.target_member_type === 'all' ||
        ((round.target_member_type === 'brother' || round.target_member_type === 'sister') &&
          round.target_member_type === memberType)),
  );
}

