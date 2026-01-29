"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";

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
] as const;

const WESLYN_DEFAULT = {
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

type Step = "select" | "customize" | "review";

interface PersonaFormData {
  name: string;
  bio: string;
  voiceDescription: string;
  doPhrases: string[];
  dontPhrases: string[];
  contentPillars: string[];
}

export default function OnboardingPersonaPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("select");
  const [selectedTemplate, setSelectedTemplate] = useState<"weslyn" | "custom" | null>(null);
  const [formData, setFormData] = useState<PersonaFormData>({
    name: "",
    bio: "",
    voiceDescription: "",
    doPhrases: [],
    dontPhrases: [],
    contentPillars: [],
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTemplateSelect = (templateId: "weslyn" | "custom") => {
    setSelectedTemplate(templateId);
    if (templateId === "weslyn") {
      setFormData({
        name: WESLYN_DEFAULT.name,
        bio: WESLYN_DEFAULT.bio,
        voiceDescription: WESLYN_DEFAULT.voiceDescription,
        doPhrases: [...WESLYN_DEFAULT.doPhrases],
        dontPhrases: [...WESLYN_DEFAULT.dontPhrases],
        contentPillars: [...WESLYN_DEFAULT.contentPillars],
      });
      setStep("review");
    } else {
      setFormData({
        name: "",
        bio: "",
        voiceDescription: "",
        doPhrases: [""],
        dontPhrases: [""],
        contentPillars: [""],
      });
      setStep("customize");
    }
  };

  const handleCustomizeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Validate
    if (!formData.name.trim()) {
      setError("Name is required");
      return;
    }
    if (formData.doPhrases.filter(Boolean).length === 0) {
      setError("At least one 'Do' phrase is required");
      return;
    }
    if (formData.contentPillars.filter(Boolean).length === 0) {
      setError("At least one content pillar is required");
      return;
    }
    setError(null);
    setStep("review");
  };

  const handleSave = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/v1/persona?action=setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: selectedTemplate,
          name: formData.name,
          bio: formData.bio || undefined,
          voiceDescription: formData.voiceDescription || undefined,
          doPhrases: formData.doPhrases.filter(Boolean),
          dontPhrases: formData.dontPhrases.filter(Boolean),
          contentPillars: formData.contentPillars.filter(Boolean),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || "Failed to save persona");
      }

      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  const updateArrayField = (
    field: keyof Omit<PersonaFormData, "name" | "bio" | "voiceDescription">,
    index: number,
    value: string
  ) => {
    setFormData((prev) => ({
      ...prev,
      [field]: prev[field].map((item, i) => (i === index ? value : item)),
    }));
  };

  const addArrayItem = (field: keyof Omit<PersonaFormData, "name" | "bio" | "voiceDescription">) => {
    setFormData((prev) => ({
      ...prev,
      [field]: [...prev[field], ""],
    }));
  };

  const removeArrayItem = (
    field: keyof Omit<PersonaFormData, "name" | "bio" | "voiceDescription">,
    index: number
  ) => {
    setFormData((prev) => ({
      ...prev,
      [field]: prev[field].filter((_, i) => i !== index),
    }));
  };

  return (
    <AppShell activeHref="/dashboard">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Create Your Persona
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            Set up your voice to generate content that sounds like you.
          </p>
        </div>

        {/* Progress */}
        <div className="mb-8 flex items-center justify-center gap-2">
          {["select", "customize", "review"].map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                  step === s
                    ? "bg-blue-600 text-white"
                    : (s === "select" && selectedTemplate) ||
                      (s === "customize" && step === "review") ||
                      (s === "review" && step === "review")
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                    : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500"
                }`}
              >
                {i + 1}
              </div>
              {i < 2 && (
                <div
                  className={`h-0.5 w-8 ${
                    step === "review" || (s === "select" && selectedTemplate)
                      ? "bg-blue-200 dark:bg-blue-800"
                      : "bg-zinc-200 dark:bg-zinc-700"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Step 1: Select Template */}
        {step === "select" && (
          <div className="space-y-4">
            {TEMPLATES.map((template) => (
              <button
                key={template.id}
                onClick={() => handleTemplateSelect(template.id as "weslyn" | "custom")}
                className="w-full rounded-xl border border-zinc-200 bg-white p-6 text-left transition-all hover:border-blue-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-blue-600"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
                      {template.name}
                    </h3>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                      {template.description}
                    </p>
                    {template.preview && (
                      <div className="mt-3 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900/50">
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          {template.preview.bio}
                        </p>
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                          {template.preview.voice}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {template.preview.pillars.map((pillar) => (
                            <span
                              key={pillar}
                              className="inline-flex items-center rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                            >
                              {pillar}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-zinc-300 text-zinc-400 dark:border-zinc-600">
                    →
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Step 2: Customize */}
        {step === "customize" && (
          <form onSubmit={handleCustomizeSubmit} className="space-y-6">
            <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
              <h3 className="mb-4 font-medium text-zinc-900 dark:text-zinc-100">
                Persona Details
              </h3>

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
            </div>

            {/* Do Phrases */}
            <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
              <h3 className="mb-4 font-medium text-zinc-900 dark:text-zinc-100">
                Phrases to Use (Do)
              </h3>
              <p className="mb-3 text-sm text-zinc-500">
                Phrases that match your voice (add at least 1)
              </p>
              {formData.doPhrases.map((phrase, index) => (
                <div key={index} className="mb-2 flex gap-2">
                  <input
                    type="text"
                    value={phrase}
                    onChange={(e) => updateArrayField("doPhrases", index, e.target.value)}
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
              <button
                type="button"
                onClick={() => addArrayItem("doPhrases")}
                className="mt-2 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
              >
                + Add phrase
              </button>
            </div>

            {/* Don't Phrases */}
            <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
              <h3 className="mb-4 font-medium text-zinc-900 dark:text-zinc-100">
                Phrases to Avoid (Don&apos;t)
              </h3>
              <p className="mb-3 text-sm text-zinc-500">
                Salesy or off-brand phrases to avoid
              </p>
              {formData.dontPhrases.map((phrase, index) => (
                <div key={index} className="mb-2 flex gap-2">
                  <input
                    type="text"
                    value={phrase}
                    onChange={(e) =>
                      updateArrayField("dontPhrases", index, e.target.value)
                    }
                    className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                    placeholder="e.g., This will change your life"
                  />
                  <button
                    type="button"
                    onClick={() => removeArrayItem("dontPhrases", index)}
                    className="rounded-lg border border-zinc-200 px-3 text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => addArrayItem("dontPhrases")}
                className="mt-2 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
              >
                + Add phrase
              </button>
            </div>

            {/* Content Pillars */}
            <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
              <h3 className="mb-4 font-medium text-zinc-900 dark:text-zinc-100">
                Content Pillars
              </h3>
              <p className="mb-3 text-sm text-zinc-500">
                Topics your content focuses on (add at least 1)
              </p>
              {formData.contentPillars.map((pillar, index) => (
                <div key={index} className="mb-2 flex gap-2">
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
              <button
                type="button"
                onClick={() => addArrayItem("contentPillars")}
                className="mt-2 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
              >
                + Add pillar
              </button>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep("select")}
                className="flex-1 rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                Back
              </button>
              <button
                type="submit"
                className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Continue
              </button>
            </div>
          </form>
        )}

        {/* Step 3: Review */}
        {step === "review" && (
          <div className="space-y-6">
            <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-lg font-semibold text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                  {formData.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {formData.name}
                  </h3>
                  <p className="text-sm text-zinc-500">
                    {formData.bio || "No bio set"}
                  </p>
                </div>
                <span className="ml-auto rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700 dark:bg-green-900 dark:text-green-300">
                  Default
                </span>
              </div>

              {formData.voiceDescription && (
                <div className="mt-4 border-t border-zinc-100 pt-4 dark:border-zinc-800">
                  <p className="text-xs font-medium text-zinc-500">VOICE</p>
                  <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
                    {formData.voiceDescription}
                  </p>
                </div>
              )}

              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs font-medium text-zinc-500">USE PHRASES</p>
                  <ul className="mt-1 space-y-1">
                    {formData.doPhrases.filter(Boolean).slice(0, 3).map((phrase, i) => (
                      <li key={i} className="text-sm text-zinc-600 dark:text-zinc-300">
                        &ldquo;{phrase}&rdquo;
                      </li>
                    ))}
                    {formData.doPhrases.filter(Boolean).length > 3 && (
                      <li className="text-sm text-zinc-400">
                        +{formData.doPhrases.filter(Boolean).length - 3} more
                      </li>
                    )}
                  </ul>
                </div>

                <div>
                  <p className="text-xs font-medium text-zinc-500">AVOID PHRASES</p>
                  <ul className="mt-1 space-y-1">
                    {formData.dontPhrases.filter(Boolean).slice(0, 3).map((phrase, i) => (
                      <li key={i} className="text-sm text-zinc-600 dark:text-zinc-300">
                        &ldquo;{phrase}&rdquo;
                      </li>
                    ))}
                    {formData.dontPhrases.filter(Boolean).length === 0 && (
                      <li className="text-sm text-zinc-400">None set</li>
                    )}
                  </ul>
                </div>

                <div>
                  <p className="text-xs font-medium text-zinc-500">CONTENT PILLARS</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {formData.contentPillars.filter(Boolean).map((pillar, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                      >
                        {pillar}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() =>
                  selectedTemplate === "custom"
                    ? setStep("customize")
                    : setStep("select")
                }
                className="flex-1 rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                Back
              </button>
              <button
                onClick={handleSave}
                disabled={isLoading}
                className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {isLoading ? "Saving..." : "Save & Continue"}
              </button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
