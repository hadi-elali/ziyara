export const adminSections = [
  'organization',
  'alarm',
  'push',
  'transport',
  'program',
  'navigation',
  'status',
  'questions',
  'families',
  'users',
  'registration',
  'content',
] as const;

export type AdminSection = (typeof adminSections)[number];

export const adminSectionTitleKeys: Record<AdminSection, string> = {
  organization: 'admin.section.organization.title',
  alarm: 'wakeUp.title',
  push: 'adminPush.title',
  transport: 'admin.transport.title',
  program: 'admin.section.program.title',
  navigation: 'admin.tile.navigation',
  status: 'admin.section.status.title',
  questions: 'admin.section.questions.title',
  families: 'admin.section.families.title',
  users: 'admin.section.users.title',
  registration: 'admin.registration.title',
  content: 'contentImport.title',
};
