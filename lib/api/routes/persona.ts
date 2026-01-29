/**
 * Persona Handlers
 *
 * Handles persona CRUD operations:
 * - GET /v1/persona - Get all personas for user
 * - POST /v1/persona?action=setup - Onboarding: create first persona
 * - POST /v1/persona - Create additional persona
 * - PUT /v1/persona - Update persona
 * - PUT /v1/persona?action=default - Set default persona
 * - DELETE /v1/persona?id=xxx - Delete persona
 */

import { ApiError, ERROR_CODES } from '../../security/errors';
import { getUserFromRequest } from '../../security/auth';
import { validateBody } from '../../security/validation';
import {
  setupPersonaSchema,
  updatePersonaSchema,
  setDefaultSchema,
  WESLYN_TEMPLATE,
} from '../schemas/requests';
import { personaRepo } from '../../db/repositories';
import { getRequestId } from '../../observability/request-id';
import { logger } from '../../observability/logger';

/**
 * Handle GET /v1/persona - Get all personas for user
 */
export async function handleGetPersonas(request: Request): Promise<Response> {
  const requestId = getRequestId();
  const log = logger.child({ requestId, handler: 'getPersonas' });

  try {
    const user = await getUserFromRequest(request.headers);
    if (!user) {
      throw new ApiError(ERROR_CODES.UNAUTHORIZED, 'Authentication required', 401);
    }

    const personas = await personaRepo.findAllByUserId(user.userId);
    const defaultPersona = await personaRepo.findDefault(user.userId);

    log.info({ count: personas.length, defaultId: defaultPersona?.id }, 'Retrieved personas');

    return Response.json({
      success: true,
      data: personas.map((p) => ({
        id: p.id,
        name: p.name,
        bio: p.bio,
        voiceDescription: p.voiceDescription,
        doPhrases: p.doPhrases,
        dontPhrases: p.dontPhrases,
        contentPillars: p.contentPillars,
        isDefault: p.isDefault,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      })),
      defaultId: defaultPersona?.id,
      hasPersonas: personas.length > 0,
    });
  } catch (error) {
    log.error({ error }, 'Failed to get personas');
    throw error;
  }
}

/**
 * Handle POST /v1/persona?action=setup - Onboarding: create first persona
 */
export async function handleSetupPersona(request: Request): Promise<Response> {
  const requestId = getRequestId();
  const log = logger.child({ requestId, handler: 'setupPersona' });

  try {
    const user = await getUserFromRequest(request.headers);
    if (!user) {
      throw new ApiError(ERROR_CODES.UNAUTHORIZED, 'Authentication required', 401);
    }

    const body = await validateBody(request, setupPersonaSchema);

    const existing = await personaRepo.findByUserId(user.userId);
    if (existing) {
      throw new ApiError(ERROR_CODES.INVALID_REQUEST, 'User already has personas', 409);
    }

    let personaData;
    if (body.templateId === "weslyn") {
      // Use Weslyn template
      personaData = {
        userId: user.userId,
        name: WESLYN_TEMPLATE.name,
        bio: WESLYN_TEMPLATE.bio,
        voiceDescription: WESLYN_TEMPLATE.voiceDescription,
        doPhrases: [...WESLYN_TEMPLATE.doPhrases],
        dontPhrases: [...WESLYN_TEMPLATE.dontPhrases],
        contentPillars: [...WESLYN_TEMPLATE.contentPillars],
        isDefault: true,
      };
    } else {
      // Custom persona
      personaData = {
        userId: user.userId,
        name: body.name!,
        bio: body.bio ?? null,
        voiceDescription: body.voiceDescription ?? null,
        doPhrases: body.doPhrases!,
        dontPhrases: body.dontPhrases ?? [],
        contentPillars: body.contentPillars!,
        isDefault: true,
      };
    }

    const persona = await personaRepo.create(personaData);
    log.info({ personaId: persona.id }, 'Created persona');

    return Response.json({
      success: true,
      data: {
        id: persona.id,
        name: persona.name,
        bio: persona.bio,
        voiceDescription: persona.voiceDescription,
        doPhrases: persona.doPhrases,
        dontPhrases: persona.dontPhrases,
        contentPillars: persona.contentPillars,
        isDefault: true,
      },
    }, { status: 201 });
  } catch (error) {
    log.error({ error }, 'Failed to setup persona');
    throw error;
  }
}

/**
 * Handle POST /v1/persona - Create additional persona
 */
export async function handleCreatePersona(request: Request): Promise<Response> {
  const requestId = getRequestId();
  const log = logger.child({ requestId, handler: 'createPersona' });

  try {
    const user = await getUserFromRequest(request.headers);
    if (!user) {
      throw new ApiError(ERROR_CODES.UNAUTHORIZED, 'Authentication required', 401);
    }

    // Use a simple schema for creating additional personas
    const { name, bio, voiceDescription, doPhrases, dontPhrases, contentPillars } = await request.json();

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new ApiError(ERROR_CODES.VALIDATION_ERROR, 'Name is required', 400);
    }

    const persona = await personaRepo.create({
      userId: user.userId,
      name: name.trim(),
      bio: bio ?? null,
      voiceDescription: voiceDescription ?? null,
      doPhrases: doPhrases ?? [],
      dontPhrases: dontPhrases ?? [],
      contentPillars: contentPillars ?? [],
      isDefault: false,
    });

    log.info({ personaId: persona.id }, 'Created persona');

    return Response.json({
      success: true,
      data: {
        id: persona.id,
        name: persona.name,
        bio: persona.bio,
        voiceDescription: persona.voiceDescription,
        doPhrases: persona.doPhrases,
        dontPhrases: persona.dontPhrases,
        contentPillars: persona.contentPillars,
        isDefault: false,
      },
    }, { status: 201 });
  } catch (error) {
    log.error({ error }, 'Failed to create persona');
    throw error;
  }
}

/**
 * Handle PUT /v1/persona - Update persona
 */
export async function handleUpdatePersona(request: Request): Promise<Response> {
  const requestId = getRequestId();
  const log = logger.child({ requestId, handler: 'updatePersona' });

  try {
    const user = await getUserFromRequest(request.headers);
    if (!user) {
      throw new ApiError(ERROR_CODES.UNAUTHORIZED, 'Authentication required', 401);
    }

    const body = await validateBody(request, updatePersonaSchema);

    const existing = await personaRepo.findById(body.id);
    if (!existing || existing.userId !== user.userId) {
      throw new ApiError(ERROR_CODES.FORBIDDEN, 'Persona not found or access denied', 403);
    }

    const updated = await personaRepo.update(body.id, {
      name: body.data.name,
      bio: body.data.bio ?? null,
      voiceDescription: body.data.voiceDescription ?? null,
      doPhrases: body.data.doPhrases,
      dontPhrases: body.data.dontPhrases,
      contentPillars: body.data.contentPillars,
    });

    log.info({ personaId: body.id }, 'Updated persona');

    return Response.json({
      success: true,
      data: {
        id: updated?.id,
        name: updated?.name,
        bio: updated?.bio,
        voiceDescription: updated?.voiceDescription,
        doPhrases: updated?.doPhrases,
        dontPhrases: updated?.dontPhrases,
        contentPillars: updated?.contentPillars,
        isDefault: updated?.isDefault,
      },
    });
  } catch (error) {
    log.error({ error }, 'Failed to update persona');
    throw error;
  }
}

/**
 * Handle PUT /v1/persona?action=default - Set default persona
 */
export async function handleSetDefault(request: Request): Promise<Response> {
  const requestId = getRequestId();
  const log = logger.child({ requestId, handler: 'setDefaultPersona' });

  try {
    const user = await getUserFromRequest(request.headers);
    if (!user) {
      throw new ApiError(ERROR_CODES.UNAUTHORIZED, 'Authentication required', 401);
    }

    const body = await validateBody(request, setDefaultSchema);

    const existing = await personaRepo.findById(body.id);
    if (!existing || existing.userId !== user.userId) {
      throw new ApiError(ERROR_CODES.FORBIDDEN, 'Persona not found or access denied', 403);
    }

    await personaRepo.setDefault(user.userId, body.id);

    log.info({ personaId: body.id }, 'Set default persona');

    return Response.json({ success: true, defaultId: body.id });
  } catch (error) {
    log.error({ error }, 'Failed to set default persona');
    throw error;
  }
}

/**
 * Handle DELETE /v1/persona?id=xxx - Delete persona
 */
export async function handleDeletePersona(request: Request): Promise<Response> {
  const requestId = getRequestId();
  const log = logger.child({ requestId, handler: 'deletePersona' });

  try {
    const user = await getUserFromRequest(request.headers);
    if (!user) {
      throw new ApiError(ERROR_CODES.UNAUTHORIZED, 'Authentication required', 401);
    }

    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (!id) {
      throw new ApiError(ERROR_CODES.VALIDATION_ERROR, 'Persona ID required', 400);
    }

    const existing = await personaRepo.findById(id);
    if (!existing || existing.userId !== user.userId) {
      throw new ApiError(ERROR_CODES.FORBIDDEN, 'Persona not found or access denied', 403);
    }

    if (existing.isDefault) {
      throw new ApiError(ERROR_CODES.INVALID_REQUEST, 'Cannot delete default persona', 400);
    }

    await personaRepo.delete(id);

    log.info({ personaId: id }, 'Deleted persona');

    return Response.json({ success: true, deleted: true });
  } catch (error) {
    log.error({ error }, 'Failed to delete persona');
    throw error;
  }
}
