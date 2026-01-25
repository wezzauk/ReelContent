/**
 * PATCH /v1/library/assets/:id - Archive an asset
 * DELETE /v1/library/assets/:id - Delete an asset
 */

import { handleArchiveAsset, handleDeleteAsset } from '../../../../../lib/api/routes/library';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  return handleArchiveAsset(request, params.id);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  return handleDeleteAsset(request, params.id);
}
