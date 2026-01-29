"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";

interface Persona {
  id: string;
  name: string;
  bio: string | null;
  voiceDescription: string | null;
  doPhrases: string[];
  dontPhrases: string[];
  contentPillars: string[];
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PersonaResponse {
  success: boolean;
  data: Persona[];
  defaultId: string | null;
  hasPersonas: boolean;
}

export default function SettingsPersonaPage() {
  const router = useRouter();
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [defaultId, setDefaultId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingPersona, setEditingPersona] = useState<Persona | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    bio: "",
    voiceDescription: "",
    doPhrases: [""],
    dontPhrases: [""],
    contentPillars: [""],
  });

  useEffect(() => {
    fetchPersonas();
  }, []);

  const fetchPersonas = async () => {
    try {
      const response = await fetch("/api/v1/persona");
      const data: PersonaResponse = await response.json();
      if (data.success) {
        setPersonas(data.data);
        setDefaultId(data.defaultId);
      }
    } catch {
      setError("Failed to load personas");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      const response = await fetch("/api/v1/persona?action=default", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await response.json();
      if (data.success) {
        setDefaultId(id);
        setSuccess("Default persona updated");
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch {
      setError("Failed to set default persona");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this persona?")) return;

    try {
      const response = await fetch(`/api/v1/persona?id=${id}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (data.success) {
        setPersonas((prev) => prev.filter((p) => p.id !== id));
        if (defaultId === id) {
          setDefaultId(null);
        }
        setSuccess("Persona deleted");
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch {
      setError("Failed to delete persona");
    }
  };

  const openCreateModal = () => {
    setFormData({
      name: "",
      bio: "",
      voiceDescription: "",
      doPhrases: [""],
      dontPhrases: [""],
      contentPillars: [""],
    });
    setEditingPersona(null);
    setShowCreateModal(true);
  };

  const openEditModal = (persona: Persona) => {
    setFormData({
      name: persona.name,
      bio: persona.bio || "",
      voiceDescription: persona.voiceDescription || "",
      doPhrases: persona.doPhrases.length > 0 ? [...persona.doPhrases] : [""],
      dontPhrases: persona.dontPhrases.length > 0 ? [...persona.dontPhrases] : [""],
      contentPillars: persona.contentPillars.length > 0 ? [...persona.contentPillars] : [""],
    });
    setEditingPersona(persona);
    setShowCreateModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const payload = {
      name: formData.name,
      bio: formData.bio || undefined,
      voiceDescription: formData.voiceDescription || undefined,
      doPhrases: formData.doPhrases.filter(Boolean),
      dontPhrases: formData.dontPhrases.filter(Boolean),
      contentPillars: formData.contentPillars.filter(Boolean),
    };

    try {
      let response: Response;
      let data: PersonaResponse;

      if (editingPersona) {
        response = await fetch("/api/v1/persona", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editingPersona.id, data: payload }),
        });
      } else {
        response = await fetch("/api/v1/persona", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      data = await response.json();

      if (data.success) {
        if (editingPersona) {
          setPersonas((prev) =>
            prev.map((p) =>
              p.id === editingPersona.id
                ? { ...p, ...data.data[0] }
                : p
            )
          );
          setSuccess("Persona updated");
        } else {
          setPersonas((prev) => [...prev, data.data[0]]);
          setSuccess("Persona created");
        }
        setShowCreateModal(false);
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(data.error?.message || "Failed to save persona");
      }
    } catch {
      setError("Failed to save persona");
    }
  };

  const updateArrayField = (
    field: "doPhrases" | "dontPhrases" | "contentPillars",
    index: number,
    value: string
  ) => {
    setFormData((prev) => ({
      ...prev,
      [field]: prev[field].map((item, i) => (i === index ? value : item)),
    }));
  };

  const addArrayItem = (field: "doPhrases" | "dontPhrases" | "contentPillars") => {
    setFormData((prev) => ({
      ...prev,
      [field]: [...prev[field], ""],
    }));
  };

  const removeArrayItem = (
    field: "doPhrases" | "dontPhrases" | "contentPillars",
    index: number
  ) => {
    setFormData((prev) => ({
      ...prev,
      [field]: prev[field].filter((_, i) => i !== index),
    }));
  };

  if (isLoading) {
    return (
      <AppShell activeHref="/settings">
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell activeHref="/settings">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              Persona Settings
            </h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
              Manage your content personas and voice settings.
            </p>
          </div>
          <button
            onClick={openCreateModal}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            + Add Persona
          </button>
        </div>

        {/* Messages */}
        {error && (
          <div className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-6 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-600 dark:bg-green-900/20 dark:text-green-400">
            {success}
          </div>
        )}

        {/* Persona List */}
        <div className="space-y-4">
          {personas.length === 0 ? (
            <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-950">
              <p className="text-zinc-500 dark:text-zinc-400">
                No personas yet. Create your first persona to get started.
              </p>
              <button
                onClick={openCreateModal}
                className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Create Persona
              </button>
            </div>
          ) : (
            personas.map((persona) => (
              <div
                key={persona.id}
                className={`rounded-xl border bg-white p-6 dark:bg-zinc-950 ${
                  persona.isDefault
                    ? "border-blue-200 dark:border-blue-800"
                    : "border-zinc-200 dark:border-zinc-800"
                }`}
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full text-lg font-semibold ${
                      persona.isDefault
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                        : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                    }`}
                  >
                    {persona.name.charAt(0).toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                        {persona.name}
                      </h3>
                      {persona.isDefault && (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                          Default
                        </span>
                      )}
                    </div>

                    {persona.bio && (
                      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                        {persona.bio}
                      </p>
                    )}

                    {persona.voiceDescription && (
                      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                        {persona.voiceDescription}
                      </p>
                    )}

                    <div className="mt-3 flex flex-wrap gap-2">
                      {persona.contentPillars.slice(0, 4).map((pillar, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                        >
                          {pillar}
                        </span>
                      ))}
                      {persona.contentPillars.length > 4 && (
                        <span className="text-xs text-zinc-500">
                          +{persona.contentPillars.length - 4} more
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {!persona.isDefault && (
                      <button
                        onClick={() => handleSetDefault(persona.id)}
                        className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                      >
                        Set Default
                      </button>
                    )}
                    <button
                      onClick={() => openEditModal(persona)}
                      className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                    >
                      Edit
                    </button>
                    {!persona.isDefault && (
                      <button
                        onClick={() => handleDelete(persona.id)}
                        className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white dark:bg-zinc-950">
            <div className="sticky top-0 border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-950">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                {editingPersona ? "Edit Persona" : "Create Persona"}
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, name: e.target.value }))
                    }
                    className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                    placeholder="e.g., My Professional Voice"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Bio
                  </label>
                  <textarea
                    value={formData.bio}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, bio: e.target.value }))
                    }
                    rows={2}
                    className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                    placeholder="e.g., 29-31, NYC, quietly ambitious"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Voice Description
                  </label>
                  <textarea
                    value={formData.voiceDescription}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        voiceDescription: e.target.value,
                      }))
                    }
                    rows={2}
                    className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                    placeholder="e.g., Calm, clear, conversational, non-salesy"
                  />
                </div>
              </div>

              {/* Do Phrases */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Phrases to Use (Do)
                </label>
                <p className="text-xs text-zinc-500">
                  Phrases that match your voice
                </p>
                <div className="mt-2 space-y-2">
                  {formData.doPhrases.map((phrase, index) => (
                    <div key={index} className="flex gap-2">
                      <input
                        type="text"
                        value={phrase}
                        onChange={(e) =>
                          updateArrayField("doPhrases", index, e.target.value)
                        }
                        className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                        placeholder="e.g., What worked for me..."
                      />
                      {formData.doPhrases.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeArrayItem("doPhrases", index)}
                          className="rounded-lg border border-zinc-200 px-3 text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => addArrayItem("doPhrases")}
                  className="mt-2 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
                >
                  + Add phrase
                </button>
              </div>

              {/* Don't Phrases */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Phrases to Avoid (Don&apos;t)
                </label>
                <p className="text-xs text-zinc-500">
                  Salesy or off-brand phrases to avoid
                </p>
                <div className="mt-2 space-y-2">
                  {formData.dontPhrases.map((phrase, index) => (
                    <div key={index} className="flex gap-2">
                      <input
                        type="text"
                        value={phrase}
                        onChange={(e) =>
                          updateArrayField("dontPhrases", index, e.target.value)
                        }
                        className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                        placeholder="e.g., This will change your life"
                      />
                      {formData.dontPhrases.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeArrayItem("dontPhrases", index)}
                          className="rounded-lg border border-zinc-200 px-3 text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => addArrayItem("dontPhrases")}
                  className="mt-2 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
                >
                  + Add phrase
                </button>
              </div>

              {/* Content Pillars */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Content Pillars
                </label>
                <p className="text-xs text-zinc-500">
                  Topics your content focuses on
                </p>
                <div className="mt-2 space-y-2">
                  {formData.contentPillars.map((pillar, index) => (
                    <div key={index} className="flex gap-2">
                      <input
                        type="text"
                        value={pillar}
                        onChange={(e) =>
                          updateArrayField("contentPillars", index, e.target.value)
                        }
                        className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                        placeholder="e.g., Make Money (Simple & Honest)"
                      />
                      {formData.contentPillars.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeArrayItem("contentPillars", index)}
                          className="rounded-lg border border-zinc-200 px-3 text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => addArrayItem("contentPillars")}
                  className="mt-2 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
                >
                  + Add pillar
                </button>
              </div>

              <div className="flex gap-3 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  {editingPersona ? "Save Changes" : "Create Persona"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
