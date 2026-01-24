/**
 * GET /v1/generations/:id - Get generation status and variants
 */

import { handleGetGeneration } from '../../../../../lib/api/routes/generations';

export async function GET(
  request: Request,
  { params }: { params: Promise<Record<string, string>> }
): Promise<Response> {
  const resolvedParams = await params;
  return handleGetGeneration(request, resolvedParams);
}
