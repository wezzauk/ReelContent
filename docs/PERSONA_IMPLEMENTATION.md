# Persona/Voice System Implementation Plan

> Status: Ready for implementation
> Based on: Weslyn AI Influencer Brand Bible

## Overview

Implement a multi-persona system where:
- **Weslyn** is included as a pre-built template you can use
- Users can create additional custom personas
- One default persona is used for generation (selectable)
- All personas can be managed in settings

---

## Weslyn Persona Template

**Pre-built persona data to include in onboarding:**

```typescript
const WESLYN_PERSONA = {
  name: "Weslyn",
  bio: "29-31, NYC, quietly ambitious",
  voiceDescription: "Calm, clear, conversational, non-salesy, everyday smart",
  doPhrases: [
    "What worked for me...",
    "This might help...",
    "Here's how I think about it...",
    "You don't need anything complicated.",
    "It's pretty simple, actually.",
    "Here's the thing...",
  ],
  dontPhrases: [
    "This will change your life",
    "Six figures fast",
    "Secret method",
    "You must do this",
    "Game changer",
    "Unlock your potential",
  ],
  contentPillars: [
    "Make Money (Simple & Honest)",
    "Productivity (Low Pressure)",
    "Everyday Life",
    "Explainers",
    "Soft Authority",
  ],
};
```

---

## Phase 1: Database Schema

### 1.1 Add `personas` table to schema

**File:** `lib/db/schema.ts`

```typescript
/**
 * Persona table - stores user voice/persona settings
 * Supports multiple personas per user with one default
 */
export const personas = pgTable(
  'personas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(), // e.g., "Weslyn"
    bio: text('bio'), // e.g., "29-31, NYC, quietly ambitious"
    voiceDescription: text('voice_description'), // e.g., "Calm, clear, conversational"
    doPhrases: text('do_phrases').array().default([]),
    dontPhrases: text('dont_phrases').array().default([]),
    contentPillars: text('content_pillars').array().default([]),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('personas_user_id_idx').on(table.userId),
    index('personas_default_idx').on(table.userId, table.isDefault),
  ]
);
```

Add relations and exports:
```typescript
export type Persona = typeof personas.$inferSelect;
export type NewPersona = typeof personas.$inferInsert;
```

### 1.2 Create migration file

**File:** `drizzle/migrations/personas_init.sql`

```sql
CREATE TABLE IF NOT EXISTS personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  bio TEXT,
  voice_description TEXT,
  do_phrases TEXT[] DEFAULT '{}',
  dont_phrases TEXT[] DEFAULT '{}',
  content_pillars TEXT[] DEFAULT '{}',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS personas_user_id_idx ON personas(user_id);
CREATE INDEX IF NOT EXISTS personas_default_idx ON personas(user_id, is_default);
```

---

## Phase 2: Repository Layer

### 2.1 Add PersonaRepository class

**File:** `lib/db/repositories.ts`

```typescript
export class PersonaRepository {
  private db = getDb();

  async create(data: NewPersona): Promise<Persona> {
    const [persona] = await this.db.insert(personas).values(data).returning();
    return persona;
  }

  async findById(id: string): Promise<Persona | null> {
    const [persona] = await this.db.select().from(personas).where(eq(personas.id, id));
    return persona || null;
  }

  async findByUserId(userId: string): Promise<Persona | null> {
    const [persona] = await this.db
      .select()
      .from(personas)
      .where(eq(personas.userId, userId))
      .orderBy(desc(personas.isDefault), desc(personas.createdAt))
      .limit(1);
    return persona || null;
  }

  async findAllByUserId(userId: string): Promise<Persona[]> {
    return this.db
      .select()
      .from(personas)
      .where(eq(personas.userId, userId))
      .orderBy(desc(personas.isDefault), desc(personas.createdAt));
  }

  async findDefault(userId: string): Promise<Persona | null> {
    const [persona] = await this.db
      .select()
      .from(personas)
      .where(and(eq(personas.userId, userId), eq(personas.isDefault, true)))
      .limit(1);
    return persona || null;
  }

  async update(id: string, data: Partial<NewPersona>): Promise<Persona | null> {
    const [persona] = await this.db
      .update(personas)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(personas.id, id))
      .returning();
    return persona || null;
  }

  async setDefault(userId: string, personaId: string): Promise<void> {
    await this.db
      .update(personas)
      .set({ isDefault: false })
      .where(and(eq(personas.userId, userId), eq(personas.isDefault, true)));

    await this.db
      .update(personas)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(eq(personas.id, personaId));
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.delete(personas).where(eq(personas.id, id));
    return (result.rowCount ?? 0) > 0;
  }
}

export const personaRepo = new PersonaRepository();
```

---

## Phase 3: API Layer

### 3.1 Add Zod schemas

**File:** `lib/api/schemas/requests.ts`

```typescript
// Persona templates (for onboarding)
export const WESLYN_TEMPLATE = {
  name: "Weslyn",
  bio: "29-31, NYC, quietly ambitious",
  voiceDescription: "Calm, clear, conversational, non-salesy, everyday smart",
  doPhrases: [
    "What worked for me...",
    "This might help...",
    "Here's how I think about it...",
    "You don't need anything complicated.",
  ],
  dontPhrases: [
    "This will change your life",
    "Six figures fast",
    "Secret method",
    "You must do this",
  ],
  contentPillars: [
    "Make Money (Simple & Honest)",
    "Productivity (Low Pressure)",
    "Everyday Life",
    "Explainers",
    "Soft Authority",
  ],
} as const;

export const personaInputSchema = z.object({
  name: z.string().min(1).max(100),
  bio: z.string().max(500).optional(),
  voiceDescription: z.string().max(1000).optional(),
  doPhrases: z.array(z.string().min(1).max(200)).default([]),
  dontPhrases: z.array(z.string().min(1).max(200)).default([]),
  contentPillars: z.array(z.string().min(1).max(100)).default([]),
});

export const setupPersonaSchema = z.object({
  templateId: z.enum(["weslyn", "custom"]).default("custom"),
  // If custom: include persona fields
  name: z.string().min(1).max(100).optional(),
  bio: z.string().max(500).optional(),
  voiceDescription: z.string().max(1000).optional(),
  doPhrases: z.array(z.string().min(1).max(200)).min(1).max(10).optional(),
  dontPhrases: z.array(z.string().min(1).max(200)).max(10).optional(),
  contentPillars: z.array(z.string().min(1).max(100)).min(1).max(5).optional(),
});

export const updatePersonaSchema = z.object({
  id: z.string().uuid(),
  data: personaInputSchema,
});

export const setDefaultSchema = z.object({
  id: z.string().uuid(),
});
```

### 3.2 Create route handlers

**File:** `lib/api/routes/persona.ts`

```typescript
import { getUserFromRequest } from '../../../security/auth';
import { ApiError, ERROR_CODES } from '../../../security/errors';
import { validateBody } from '../../../security/validation';
import { setupPersonaSchema, updatePersonaSchema, setDefaultSchema, WESLYN_TEMPLATE } from '../../../api/schemas/requests';
import { personaRepo } from '../../../db/repositories';
import { getRequestId } from '../../../observability/request-id';
import { logger } from '../../../observability/logger';

// GET /v1/persona - Get all personas for user
export async function handleGetPersonas(request: Request): Promise<Response> {
  const user = await getUserFromRequest(request.headers);
  if (!user) {
    return Response.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
      { status: 401 }
    );
  }

  const personas = await personaRepo.findAllByUserId(user.userId);
  const defaultPersona = await personaRepo.findDefault(user.userId);

  return Response.json({
    success: true,
    data: personas.map(p => ({
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
}

// POST /v1/persona/setup - Onboarding: create first persona
export async function handleSetupPersona(request: Request): Promise<Response> {
  const user = await getUserFromRequest(request.headers);
  if (!user) {
    throw new ApiError(ERROR_CODES.UNAUTHORIZED, 'Authentication required', 401);
  }

  const body = await validateBody(request, setupPersonaSchema);

  const existing = await personaRepo.findByUserId(user.userId);
  if (existing) {
    throw new ApiError(ERROR_CODES.CONFLICT, 'User already has personas', 409);
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
}

// POST /v1/persona - Create additional persona
export async function handleCreatePersona(request: Request): Promise<Response> {
  const user = await getUserFromRequest(request.headers);
  if (!user) {
    throw new ApiError(ERROR_CODES.UNAUTHORIZED, 'Authentication required', 401);
  }

  const body = await validateBody(request, personaInputSchema);

  const persona = await personaRepo.create({
    userId: user.userId,
    name: body.name,
    bio: body.bio ?? null,
    voiceDescription: body.voiceDescription ?? null,
    doPhrases: body.doPhrases,
    dontPhrases: body.dontPhrases,
    contentPillars: body.contentPillars,
    isDefault: false, // New personas are not default by default
  });

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
}

// PUT /v1/persona - Update persona
export async function handleUpdatePersona(request: Request): Promise<Response> {
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
}

// PUT /v1/persona/default - Set default persona
export async function handleSetDefault(request: Request): Promise<Response> {
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

  return Response.json({ success: true, defaultId: body.id });
}

// DELETE /v1/persona - Delete persona
export async function handleDeletePersona(request: Request): Promise<Response> {
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

  return Response.json({ success: true, deleted: true });
}
```

### 3.3 Create API route entry points

**File:** `app/api/v1/persona/route.ts`

```typescript
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
```

---

## Phase 4: AI Prompt Integration

### 4.1 Extend Calibration interface

**File:** `lib/ai/llm-client.ts`

```typescript
export interface Calibration {
  niche: string;
  audience?: string;
  tone?: string;
  goals?: string[];
  // Persona fields
  personaId?: string;
  personaName?: string;
  personaBio?: string;
  personaVoice?: string;
  personaDoPhrases?: string[];
  personaDontPhrases?: string[];
  personaContentPillars?: string[];
}
```

### 4.2 Update OpenAI provider

**File:** `lib/ai/providers/openai.ts`

Inject persona guidance into prompt (existing logic preserved):

```typescript
function buildMessages(req: GenerateContentRequest): Array<{ role: "system" | "user"; content: string }> {
  const personaSections: string[] = [];

  if (req.calibration.personaName) {
    personaSections.push(`Persona Name: ${req.calibration.personaName}`);
  }
  if (req.calibration.personaBio) {
    personaSections.push(`Persona Bio: ${req.calibration.personaBio}`);
  }
  if (req.calibration.personaVoice) {
    personaSections.push(`Voice Style: ${req.calibration.personaVoice}`);
  }
  if (req.calibration.personaDoPhrases?.length) {
    personaSections.push(`USE phrases like: ${req.calibration.personaDoPhrases.join(", ")}`);
  }
  if (req.calibration.personaDontPhrases?.length) {
    personaSections.push(`AVOID phrases like: ${req.calibration.personaDontPhrases.join(", ")}`);
  }
  if (req.calibration.personaContentPillars?.length) {
    personaSections.push(`Content Pillars: ${req.calibration.personaContentPillars.join(", ")}`);
  }

  const user = [
    // ... existing fields
    personaSections.length ? ["", "=== PERSONA GUIDANCE ===", ...personaSections].join("\n") : "",
    // ... rest
  ].filter(Boolean).join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
```

---

## Phase 5: UI Components

### 5.1 Onboarding Page

**File:** `app/onboarding/persona/page.tsx`

Wizard-style flow:
1. **Choose Template** - Select "Weslyn" or "Custom"
   - Show Weslyn preview card with her details
2. **Customize** (only if Weslyn selected) - Edit any fields
3. **Review** - Confirm and save

```typescript
const TEMPLATES = [
  {
    id: "weslyn",
    name: "Weslyn",
    description: "Calm, clear, conversational. Girl-next-door who figured things out.",
    preview: {
      bio: "29-31, NYC, quietly ambitious",
      voice: "Calm, clear, conversational, non-salesy",
      pillars: ["Make Money", "Productivity", "Everyday Life", "Explainers"],
    },
  },
  {
    id: "custom",
    name: "Custom Persona",
    description: "Create your own persona from scratch.",
  },
];
```

### 5.2 Settings Page - Persona List

**File:** `app/settings/persona/page.tsx`

Shows all personas with:
- Default badge on active persona
- "Set as Default" button on non-defaults
- Edit button for each
- Delete button (not on default)
- "Add New Persona" button

### 5.3 Create Page - Persona Selector

**File:** `app/create/page.tsx`

Add persona dropdown above the prompt:
- Shows current default persona name
- Opens persona picker modal
- "Manage Personas" link to settings

---

## Phase 6: Files Summary

### New Files
| Path | Purpose |
|------|---------|
| `drizzle/migrations/personas_init.sql` | DB migration |
| `app/api/v1/persona/route.ts` | API entry |
| `lib/api/routes/persona.ts` | Route handlers |
| `app/settings/persona/page.tsx` | Persona list/settings |
| `app/onboarding/persona/page.tsx` | Onboarding wizard |
| `tests/api/persona.test.ts` | Schema tests |

### Modified Files
| Path | Changes |
|------|---------|
| `lib/db/schema.ts` | Add personas table |
| `lib/db/repositories.ts` | Add PersonaRepository |
| `lib/api/schemas/requests.ts` | Add persona schemas + WESLYN_TEMPLATE |
| `lib/ai/llm-client.ts` | Extend Calibration |
| `lib/ai/providers/openai.ts` | Inject persona into prompts |
| `lib/ai/providers/anthropic.ts` | Inject persona into prompts |
| `components/TopNav.tsx` | Add Settings nav |
| `app/create/page.tsx` | Add persona selector |

---

## Testing Checklist

- [ ] Onboarding shows Weslyn template option
- [ ] Selecting Weslyn pre-fills all fields
- [ ] Creating a custom persona works
- [ ] Multiple personas can be created
- [ ] Setting a default persona works
- [ ] Deleting non-default persona works
- [ ] Cannot delete default persona
- [ ] AI generation uses selected persona
- [ ] Settings page shows all personas correctly
