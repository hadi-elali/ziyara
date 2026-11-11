import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { Button } from '@/components/ui/button';
import { AdminDashboard } from '@/features/admin/AdminDashboard';
import { adminSections, adminSectionTitleKeys } from '@/features/admin/admin-sections';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { useI18n } from '@/features/i18n/i18n';
import { adminSectionRoute, singleRouteParam } from '@/features/navigation/routes';

export default function AdminSectionScreen() {
  const params = useLocalSearchParams<{ section?: string | string[] }>();
  const router = useRouter();
  const { t } = useI18n();
  const section = adminSections.find((candidate) => candidate === singleRouteParam(params.section));

  if (!section) return <Redirect href="/admin" />;

  return (
    <RequireAuth admin returnTo={adminSectionRoute(section)}>
      <Stack.Screen
        options={{
          title: t(adminSectionTitleKeys[section]),
          headerBackVisible: false,
          headerLeft: () => (
            <Button
              icon="back"
              label={t('common.back')}
              onPress={() => router.canGoBack() ? router.back() : router.replace('/admin')}
              size="compact"
              variant="ghost"
            />
          ),
        }}
      />
      <AdminDashboard key={section} section={section} />
    </RequireAuth>
  );
}
