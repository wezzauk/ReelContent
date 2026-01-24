/**
 * Draft Handlers
 *
 * Handles GET /v1/drafts/:id and PATCH /v1/drafts/:id
 */

import { ApiError, ERROR_CODES } from '../../security/errors.js';
import { getUserFromHeader } from '../../security/auth.js';
import { validatePath, validateBody } from '../../security/validation.js';
import {
  getDraftSchema,
  updateDraftSchema,
  type GetDraftRequest,
  type UpdateDraftRequest,
} from '../schemas/requests.js';
import { draftRepo } from '../../db/repositories.js';
import { logger } from '../../observability/logger.js';
import { getRequestId } from '../../observability/request-id.js';

/**
 * Handle GET /v1/drafts/:id
 */
export async function handleGetDraft(request: Request, params: Record<string, string>): Promise<Response> {
  const requestId = getRequestId();
  const log = logger.child({ requestId, handler: 'getDraft' });

  try {
    // 1. Authenticate
    const user = await getUserFromHeader(request.headers.get('authorization'));
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

    // 5. Return draft
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
    const user = await getUserFromHeader(request.headers.get('authorization'));
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
