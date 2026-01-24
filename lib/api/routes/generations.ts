/**
 * Generation Handler
 *
 * Handles GET /v1/generations/:id
 */

import { ApiError, ERROR_CODES } from '../../security/errors.js';
import { getUserFromHeader } from '../../security/auth.js';
import { validatePath } from '../../security/validation.js';
import {
  getGenerationSchema,
  type GetGenerationRequest,
} from '../schemas/requests.js';
import { generationRepo, variantRepo } from '../../db/repositories.js';
import { logger } from '../../observability/logger.js';
import { getRequestId } from '../../observability/request-id.js';

/**
 * Handle GET /v1/generations/:id
 */
export async function handleGetGeneration(request: Request, params: Record<string, string>): Promise<Response> {
  const requestId = getRequestId();
  const log = logger.child({ requestId, handler: 'getGeneration' });

  try {
    // 1. Authenticate
    const user = await getUserFromHeader(request.headers.get('authorization'));
    if (!user) {
      throw new ApiError(ERROR_CODES.UNAUTHORIZED, 'Authentication required', 401);
    }

    // 2. Validate path params
    const { id } = validatePath(params, getGenerationSchema);
    log.info({ generationId: id }, 'Get generation request');

    // 3. Fetch generation
    const generation = await generationRepo.findById(id);
    if (!generation) {
      throw new ApiError(ERROR_CODES.NOT_FOUND, 'Generation not found', 404);
    }

    // 4. Check ownership
    if (generation.ownerId !== user.userId) {
      throw new ApiError(ERROR_CODES.FORBIDDEN, 'Not authorized', 403);
    }

    // 5. Fetch variants (only if completed)
    let variants: Array<{
      id: string;
      variantIndex: number;
      content: string;
      videoUrl: string | null;
      thumbnailUrl: string | null;
      createdAt: Date;
    }> = [];

    if (generation.status === 'completed' || generation.status === 'processing') {
      variants = await variantRepo.findByGenerationId(id);
    }

    // 6. Build response
    const response = {
      success: true,
      data: {
        id: generation.id,
        status: generation.status,
        errorMessage: generation.errorMessage,
        isRegen: generation.isRegen,
        parentGenerationId: generation.parentGenerationId,
        regenType: generation.regenType,
        variants: variants.map((v) => ({
          id: v.id,
          variantIndex: v.variantIndex,
          content: v.content,
          videoUrl: v.videoUrl,
          thumbnailUrl: v.thumbnailUrl,
          createdAt: v.createdAt.toISOString(),
        })),
        metadata: JSON.parse(generation.metadata ?? '{}'),
        createdAt: generation.createdAt.toISOString(),
        updatedAt: generation.updatedAt.toISOString(),
        completedAt: generation.completedAt?.toISOString() ?? null,
      },
    };

    // 7. Check if generation is ready (polling support)
    if (generation.status === 'pending' || generation.status === 'processing') {
      // Add polling hints
      (response.data as Record<string, unknown>).polling = {
        suggestedIntervalMs: 2000,
        estimatedWaitMs: 30000,
      };
    }

    return Response.json(response, {
      headers: { 'X-Request-ID': requestId },
    });
  } catch (error) {
    log.error({ error }, 'Get generation failed');
    return Response.json(
      {
        success: false,
        error: {
          code: error instanceof ApiError ? error.code : ERROR_CODES.INTERNAL_ERROR,
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      {
        status: error instanceof ApiError ? error.status : 500,
        headers: { 'X-Request-ID': requestId },
      }
    );
  }
}
