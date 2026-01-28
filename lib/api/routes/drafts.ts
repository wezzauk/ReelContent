/**
 * Draft Handlers
 *
 * Handles GET /v1/drafts/:id and PATCH /v1/drafts/:id
 */

import { ApiError, ERROR_CODES } from '../../security/errors';
import { getUserFromRequest } from '../../security/auth';
import { validatePath, validateBody } from '../../security/validation';
import {
  getDraftSchema,
  updateDraftSchema,
  type GetDraftRequest,
  type UpdateDraftRequest,
} from '../schemas/requests';
import { draftRepo, generationRepo, variantRepo } from '../../db/repositories';
import { logger } from '../../observability/logger';
import { getRequestId } from '../../observability/request-id';

/**
 * Handle GET /v1/drafts/:id
 */
export async function handleGetDraft(request: Request, params: Record<string, string>): Promise<Response> {
  const requestId = getRequestId();
  const log = logger.child({ requestId, handler: 'getDraft' });

  try {
    // 1. Authenticate
    const user = await getUserFromRequest(request.headers);
    if (!user) {
      throw new ApiError(ERROR_CODES.UNAUTHORIZED, 'Authentication required', 401);
    }

    // 2. Validate path params
    const { id } = validatePath(params, getDraftSchema);
    log.info({ draftId: id }, 'Get draft request');

    // 3. Fetch draft
    const draft = await draftRepo.findById(id);
    if (!draft) {
      throw new ApiError(ERROR_CODES.NOT_FOUND, 'Draft not found', 404);
    }

    // 4. Check ownership
    if (draft.ownerId !== user.userId) {
      throw new ApiError(ERROR_CODES.FORBIDDEN, 'Not authorized', 403);
    }

    // 5. Fetch latest generation for this draft (if exists)
    const generations = await generationRepo.findByDraftId(id);
    const latestGeneration = generations.length > 0 ? generations[0] : null;

    // 6. Fetch variants if generation is completed
    let variants: Array<{
      id: string;
      variantIndex: number;
      content: string;
      videoUrl: string | null;
      thumbnailUrl: string | null;
      createdAt: Date;
    }> = [];

    if (latestGeneration && (latestGeneration.status === 'completed' || latestGeneration.status === 'processing')) {
      variants = await variantRepo.findByGenerationId(latestGeneration.id);
    }

    // 7. Return draft with generation data
    return Response.json({
      success: true,
      data: {
        id: draft.id,
        title: draft.title,
        prompt: draft.prompt,
        platform: draft.platform,
        selectedVariantId: draft.selectedVariantId,
        settings: JSON.parse(draft.settings ?? '{}'),
        isArchived: draft.isArchived,
        createdAt: draft.createdAt.toISOString(),
        updatedAt: draft.updatedAt.toISOString(),
        // Include latest generation if exists
        generation: latestGeneration ? {
          id: latestGeneration.id,
          status: latestGeneration.status,
          errorMessage: latestGeneration.errorMessage,
          isRegen: latestGeneration.isRegen,
          variants: variants.map((v) => ({
            id: v.id,
            variantIndex: v.variantIndex,
            content: v.content,
            videoUrl: v.videoUrl,
            thumbnailUrl: v.thumbnailUrl,
            createdAt: v.createdAt.toISOString(),
          })),
          createdAt: latestGeneration.createdAt.toISOString(),
          updatedAt: latestGeneration.updatedAt.toISOString(),
          completedAt: latestGeneration.completedAt?.toISOString() ?? null,
          polling: (latestGeneration.status === 'pending' || latestGeneration.status === 'processing') ? {
            suggestedIntervalMs: 2000,
            estimatedWaitMs: 30000,
          } : undefined,
        } : null,
      },
    }, {
      headers: { 'X-Request-ID': requestId },
    });
  } catch (error) {
    log.error({ error }, 'Get draft failed');
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

/**
 * Handle PATCH /v1/drafts/:id
 */
export async function handleUpdateDraft(request: Request, params: Record<string, string>): Promise<Response> {
  const requestId = getRequestId();
  const log = logger.child({ requestId, handler: 'updateDraft' });

  try {
    // 1. Authenticate
    const user = await getUserFromRequest(request.headers);
    if (!user) {
      throw new ApiError(ERROR_CODES.UNAUTHORIZED, 'Authentication required', 401);
    }

    // 2. Validate path params
    const { id } = validatePath(params, getDraftSchema);

    // 3. Validate body
    const body = await validateBody(request, updateDraftSchema);
    log.info({ draftId: id, body }, 'Update draft request');

    // 4. Fetch draft
    const draft = await draftRepo.findById(id);
    if (!draft) {
      throw new ApiError(ERROR_CODES.NOT_FOUND, 'Draft not found', 404);
    }

    // 5. Check ownership
    if (draft.ownerId !== user.userId) {
      throw new ApiError(ERROR_CODES.FORBIDDEN, 'Not authorized', 403);
    }

    // 6. Update draft
    const updateData: Record<string, unknown> = {};
    if (body.selectedVariantId !== undefined) {
      updateData.selectedVariantId = body.selectedVariantId;
    }
    if (body.title !== undefined) {
      updateData.title = body.title;
    }
    if (body.settings !== undefined) {
      updateData.settings = body.settings;
    }

    const updated = await draftRepo.update(id, updateData);

    if (!updated) {
      throw new ApiError(ERROR_CODES.INTERNAL_ERROR, 'Failed to update draft', 500);
    }

    log.info({ draftId: id }, 'Draft updated');

    // 7. Return updated draft
    return Response.json({
      success: true,
      data: {
        id: updated.id,
        title: updated.title,
        selectedVariantId: updated.selectedVariantId,
        updatedAt: updated.updatedAt.toISOString(),
      },
    }, {
      headers: { 'X-Request-ID': requestId },
    });
  } catch (error) {
    log.error({ error }, 'Update draft failed');
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
