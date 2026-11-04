export type GroupCheckDispatchDependencies = {
  getUserId: (token: string) => Promise<string | null>;
  isAdmin: (userId: string) => Promise<boolean>;
  dispatch: (checkId: number, userId: string) => Promise<{ pushFailed: boolean }>;
};

export async function handleGroupCheckPushRequest(
  request: { method: string; authorization: string | null; body: unknown },
  dependencies: GroupCheckDispatchDependencies,
) {
  const reply = (status: number, code: string, pushFailed?: boolean) => ({
    status, body: { code, ...(pushFailed === undefined ? {} : { pushFailed }) },
  });
  if (request.method !== 'POST') return reply(405, 'method_not_allowed');
  const token = request.authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return reply(401, 'unauthorized');
  try {
    const userId = await dependencies.getUserId(token);
    if (!userId) return reply(401, 'unauthorized');
    if (!await dependencies.isAdmin(userId)) return reply(403, 'admin_required');
    const body = request.body;
    const checkId = body && typeof body === 'object' && 'checkId' in body ? body.checkId : null;
    if (typeof checkId !== 'number' || !Number.isSafeInteger(checkId) || checkId <= 0) {
      return reply(400, 'invalid_check');
    }
    const result = await dependencies.dispatch(checkId, userId);
    return reply(200, 'processed', result.pushFailed);
  } catch {
    return reply(500, 'dispatch_failed');
  }
}
