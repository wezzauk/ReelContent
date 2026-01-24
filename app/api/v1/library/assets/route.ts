/**
 * POST /v1/library/assets - Create an asset in the library
 * GET /v1/library/assets - List assets with pagination
 */

import { handleCreateAsset, handleListAssets } from '../../../../../lib/api/routes/library';

export async function POST(request: Request): Promise<Response> {
  return handleCreateAsset(request);
}

export async function GET(request: Request): Promise<Response> {
  return handleListAssets(request);
}
