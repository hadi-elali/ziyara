import { FunctionsHttpError } from '@supabase/supabase-js';

import { getOriginalErrorMessage } from '@/features/network/supabase-read';

export async function adminPushSendErrorMessage(error: unknown, t: (key: string) => string) {
  if (error instanceof FunctionsHttpError) {
    let code: unknown;
    try {
      const body: unknown = await error.context.json();
      if (body !== null && typeof body === 'object' && 'code' in body) code = body.code;
    } catch {
      // Gateways can return HTML or an empty body. The HTTP status still helps.
    }
    if (error.context.status === 404 || code === 'NOT_FOUND' || code === 'not_configured') {
      return t('adminPush.unavailable');
    }
    if (error.context.status === 401 || code === 'unauthorized') return t('adminPush.sessionError');
    if (error.context.status === 403 || code === 'admin_required') return t('adminPush.accessError');
    if (code === 'invalid_message') return t('adminPush.messageError');
    // A server failure may happen after claiming or sending devices. Keep the
    // same message ID and show the existing uncertainty/retry explanation.
    return t('adminPush.sendError');
  }
  const detail = getOriginalErrorMessage(error);
  const message = t('adminPush.sendError');
  return detail && detail !== message ? `${message} ${detail}` : message;
}
