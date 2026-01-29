/**
 * Persona API Route
 *
 * Route: /v1/persona
 *
 * GET    /v1/persona              - Get all personas for user
 * POST   /v1/persona?action=setup - Onboarding: create first persona
 * POST   /v1/persona              - Create additional persona
 * PUT    /v1/persona              - Update persona
 * PUT    /v1/persona?action=default - Set default persona
 * DELETE /v1/persona?id=xxx       - Delete persona
 */

import {
  handleGetPersonas,
  handleSetupPersona,
  handleCreatePersona,
  handleUpdatePersona,
  handleSetDefault,
  handleDeletePersona,
} from '../../../../lib/api/routes/persona';

export async function GET(request: Request): Promise<Response> {
  return handleGetPersonas(request);
}

export async function POST(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.searchParams.get("action") === "setup") {
    return handleSetupPersona(request);
  }
  return handleCreatePersona(request);
}

export async function PUT(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.searchParams.get("action") === "default") {
    return handleSetDefault(request);
  }
  return handleUpdatePersona(request);
}

export async function DELETE(request: Request): Promise<Response> {
  return handleDeletePersona(request);
}
