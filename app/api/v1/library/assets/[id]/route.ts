/**
 * PATCH /v1/library/assets/:id - Archive an asset
 * DELETE /v1/library/assets/:id - Delete an asset
 */

import { handleArchiveAsset, handleDeleteAsset } from '../../../../../../lib/api/routes/library';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const resolvedParams = await params;
  return handleArchiveAsset(request, resolvedParams.id);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const resolvedParams = await params;
  return handleDeleteAsset(request, resolvedParams.id);
}
