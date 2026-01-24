/**
 * GET /v1/drafts/:id - Get a draft
 * PATCH /v1/drafts/:id - Update a draft
 */

import { handleGetDraft, handleUpdateDraft } from '../../../../../lib/api/routes/drafts';

export async function GET(
  request: Request,
  { params }: { params: Promise<Record<string, string>> }
): Promise<Response> {
  const resolvedParams = await params;
  return handleGetDraft(request, resolvedParams);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<Record<string, string>> }
): Promise<Response> {
  const resolvedParams = await params;
  return handleUpdateDraft(request, resolvedParams);
}
