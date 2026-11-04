import { supabase } from '@/features/auth/supabase';

export async function dispatchGroupCheckPush(checkId: number): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke<{
      code: string;
      pushFailed: boolean;
    }>('dispatch-group-check', { body: { checkId } });
    return !error && data?.code === 'processed' && data.pushFailed === false;
  } catch {
    return false;
  }
}
