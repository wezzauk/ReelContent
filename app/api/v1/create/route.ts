/**
 * POST /v1/create - Create a new generation
 */

import { handleCreate } from '../../../../lib/api/routes/create';

export async function POST(request: Request): Promise<Response> {
  return handleCreate(request);
}
