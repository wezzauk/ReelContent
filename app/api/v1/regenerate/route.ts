/**
 * POST /v1/regenerate - Regenerate content from an existing draft
 */

import { handleRegenerate } from '../../../../lib/api/routes/regenerate';

export async function POST(request: Request): Promise<Response> {
  return handleRegenerate(request);
}
