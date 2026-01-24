/**
 * Library - Asset Handlers
 *
 * Handles POST /v1/library/assets and GET /v1/library/assets
 */

import { ApiError, ERROR_CODES } from '../../security/errors.js';
import { getUserFromHeader } from '../../security/auth.js';
import { validateBody, validateQuery } from '../../security/validation.js';
import {
  createAssetSchema,
  listAssetsSchema,
  type CreateAssetRequest,
  type ListAssetsRequest,
} from '../schemas/requests.js';
import { assetRepo, draftRepo, variantRepo } from '../../db/repositories.js';
import { getOrSetIdempotency } from '../../enforcement/index.js';
import { logger } from '../../observability/logger.js';
import { getRequestId } from '../../observability/request-id.js';

/**
 * Handle POST /v1/library/assets
 * Save an asset to the library (from draft+variant or raw content)
 */
export async function handleCreateAsset(request: Request): Promise<Response> {
  const requestId = getRequestId();
  const log = logger.child({ requestId, handler: 'createAsset' });

  try {
    // 1. Authenticate
    const user = await getUserFromHeader(request.headers.get('authorization'));
    if (!user) {
      throw new ApiError(ERROR_CODES.UNAUTHORIZED, 'Authentication required', 401);
    }

    log.info({ userId: user.userId }, 'User authenticated');

    // 2. Validate request body
    const body = await validateBody(request, createAssetSchema);
    log.info({ hasDraftId: !!body.draftId, hasContent: !!body.content }, 'Request validated');

    // 3. Check idempotency (if provided)
    if (body.idempotencyKey) {
      const existing = await assetRepo.findByOwnerId(user.userId, {
        limit: 1,
        cursor: { id: body.idempotencyKey, createdAt: new Date() },
      });
      // Simple idempotency check - in production, store idempotency keys separately
    }

    // 4. Resolve asset content and metadata
    let title = body.title ?? 'Untitled Asset';
    let content = body.content ?? '';
    let platform = body.platform;
    let sourceDraftId: string | null = null;
    let sourceVariantId: string | null = null;

    if (body.draftId && body.variantId) {
      // Fetch from draft+variant
      const draft = await draftRepo.findById(body.draftId);
      if (!draft) {
        throw new ApiError(ERROR_CODES.NOT_FOUND, 'Draft not found', 404);
      }
      if (draft.ownerId !== user.userId) {
        throw new ApiError(ERROR_CODES.FORBIDDEN, 'Not authorized', 403);
      }

      const variant = await variantRepo.findById(body.variantId);
      if (!variant) {
        throw new ApiError(ERROR_CODES.NOT_FOUND, 'Variant not found', 404);
      }
      if (variant.draftId !== body.draftId) {
        throw new ApiError(ERROR_CODES.INVALID_REQUEST, 'Variant does not belong to draft', 400);
      }

      title = draft.title ?? title;
      content = variant.content;
      platform = draft.platform;
      sourceDraftId = body.draftId;
      sourceVariantId = body.variantId;
    }

    // 5. Create asset record
    const asset = await assetRepo.create({
      ownerId: user.userId,
      draftId: sourceDraftId,
      variantId: sourceVariantId,
      title,
      content,
      platform: platform ?? null,
      tags: body.tags,
      status: 'draft',
      metadata: '{}',
    });

    log.info({ assetId: asset.id }, 'Asset created');

    // 6. Set idempotency if provided
    if (body.idempotencyKey) {
      await getOrSetIdempotency(
        'library:create',
        body.idempotencyKey,
        user.userId,
        { assetId: asset.id }
      );
    }

    // 7. Return 201 Created
    return Response.json({
      success: true,
      data: {
        assetId: asset.id,
        title: asset.title,
        status: asset.status,
      },
    }, {
      status: 201,
      headers: {
        'X-Request-ID': requestId,
        'Location': `/v1/library/assets/${asset.id}`,
      },
    });
  } catch (error) {
    log.error({ error }, 'Create asset failed');
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
 * Handle GET /v1/library/assets
 * List assets with cursor pagination and filters
 */
export async function handleListAssets(request: Request): Promise<Response> {
  const requestId = getRequestId();
  const log = logger.child({ requestId, handler: 'listAssets' });

  try {
    // 1. Authenticate
    const user = await getUserFromHeader(request.headers.get('authorization'));
    if (!user) {
      throw new ApiError(ERROR_CODES.UNAUTHORIZED, 'Authentication required', 401);
    }

    // 2. Parse and validate query params
    const url = new URL(request.url);
    const params = validateQuery(url.searchParams, listAssetsSchema);

    log.info({ userId: user.userId, params }, 'List assets request');

    // 3. Parse tags filter
    const tags = params.tags ? params.tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined;

    // 4. Build cursor if provided
    let cursor = undefined;
    if (params.cursor) {
      try {
        const decoded = Buffer.from(params.cursor, 'base64').toString('utf-8');
        const [id, createdAt] = decoded.split('::');
        cursor = { id, createdAt: new Date(createdAt) };
      } catch {
        // Invalid cursor, ignore
      }
    }

    // 5. Query assets
    const assets = await assetRepo.findByOwnerId(user.userId, {
      status: params.status,
      platform: params.platform,
      tags,
      search: params.q,
      limit: params.limit,
      cursor,
    });

    log.info({ count: assets.length }, 'Assets fetched');

    // 6. Build next cursor
    let nextCursor: string | undefined;
    if (assets.length === params.limit) {
      const lastAsset = assets[assets.length - 1];
      const cursorValue = `${lastAsset.id}::${lastAsset.createdAt.toISOString()}`;
      nextCursor = Buffer.from(cursorValue).toString('base64');
    }

    // 7. Return 200 OK
    return Response.json({
      success: true,
      data: assets.map((asset) => ({
        id: asset.id,
        title: asset.title,
        content: asset.content?.substring(0, 200),
        platform: asset.platform,
        tags: asset.tags,
        status: asset.status,
        createdAt: asset.createdAt.toISOString(),
        updatedAt: asset.updatedAt.toISOString(),
      })),
      nextCursor,
    }, {
      headers: { 'X-Request-ID': requestId },
    });
  } catch (error) {
    log.error({ error }, 'List assets failed');
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
