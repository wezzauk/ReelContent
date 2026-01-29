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

interface FormData {
  prompt: string;
  platform: "tiktok" | "youtube_shorts" | "instagram_reels";
  title: string;
  variantCount: number;
  personaId: string | null;
}

interface FormErrors {
  prompt?: string;
  platform?: string;
  title?: string;
  variantCount?: string;
  general?: string;
}

export default function CreatePage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [defaultPersonaId, setDefaultPersonaId] = useState<string | null>(null);
  const [personasLoading, setPersonasLoading] = useState(true);
  const [formData, setFormData] = useState<FormData>({
    prompt: "",
    platform: "tiktok",
    title: "",
    variantCount: 1,
    personaId: null,
  });
  const [errors, setErrors] = useState<FormErrors>({});

  useEffect(() => {
    fetchPersonas();
  }, []);

  const fetchPersonas = async () => {
    try {
      const response = await fetch("/api/v1/persona");
      const data: PersonaResponse = await response.json();
      if (data.success) {
        setPersonas(data.data);
        setDefaultPersonaId(data.defaultId);
        // Auto-select default persona
        if (data.defaultId) {
          setFormData((prev) => ({ ...prev, personaId: data.defaultId }));
        }
      }
    } catch {
      // Silently fail - personas are optional
    } finally {
      setPersonasLoading(false);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.prompt.trim()) {
      newErrors.prompt = "Prompt is required";
    } else if (formData.prompt.trim().length < 10) {
      newErrors.prompt = "Prompt must be at least 10 characters";
    } else if (formData.prompt.trim().length > 5000) {
      newErrors.prompt = "Prompt must be less than 5000 characters";
    }

    if (!formData.platform) {
      newErrors.platform = "Platform is required";
    }

    if (formData.title && formData.title.length > 200) {
      newErrors.title = "Title must be less than 200 characters";
    }

    if (formData.variantCount < 1 || formData.variantCount > 5) {
      newErrors.variantCount = "Must generate 1-5 variants";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsLoading(true);
    setErrors({});

    try {
      const response = await fetch("/api/v1/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include", // Send httpOnly cookies automatically
        body: JSON.stringify({
          prompt: formData.prompt.trim(),
          platform: formData.platform,
          title: formData.title.trim() || undefined,
          variantCount: formData.variantCount,
          personaId: formData.personaId || undefined,
        }),
      });

      // Handle unauthorized - redirect to login
      if (response.status === 401) {
        router.push("/login");
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        setErrors({
          general: data.error?.message || "Failed to create reel. Please try again.",
        });
        return;
      }

      // Redirect to review page with the new draft
      router.push(`/review/${data.data.draftId}`);
      router.refresh();
    } catch {
      setErrors({ general: "Network error. Please try again." });
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === "variantCount" ? parseInt(value, 10) : value,
    }));
    // Clear error when user starts typing
    if (errors[name as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const platforms = [
    { value: "tiktok", label: "TikTok", icon: "🎵" },
    { value: "instagram_reels", label: "Instagram Reels", icon: "📸" },
    { value: "youtube_shorts", label: "YouTube Shorts", icon: "▶️" },
  ];

  return (
    <AppShell activeHref="/create">
      <div className="mx-auto max-w-2xl">
        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Create New Reel
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            Describe what you want and we&apos;ll generate it for you.
          </p>
        </div>

        {/* Form Card */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          {/* General Error */}
          {errors.general && (
            <div className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
              {errors.general}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Platform Selection */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Target Platform
              </label>
              <div className="mt-2 grid grid-cols-3 gap-3">
                {platforms.map((platform) => (
                  <button
                    key={platform.value}
                    type="button"
                    onClick={() =>
                      setFormData((prev) => ({
                        ...prev,
                        platform: platform.value as FormData["platform"],
                      }))
                    }
                    className={`flex flex-col items-center justify-center rounded-lg border p-3 transition-colors ${
                      formData.platform === platform.value
                        ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-900/20 dark:text-blue-300"
                        : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:border-zinc-600 dark:hover:bg-zinc-900"
                    }`}
                  >
                    <span className="text-2xl">{platform.icon}</span>
                    <span className="mt-1 text-sm font-medium">
                      {platform.label}
                    </span>
                  </button>
                ))}
              </div>
              {errors.platform && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                  {errors.platform}
                </p>
              )}
            </div>

            {/* Persona Selection */}
            <div>
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Voice / Persona
                </label>
                {personasLoading ? (
                  <span className="text-xs text-zinc-400">Loading...</span>
                ) : personas.length === 0 ? (
                  <a
                    href="/onboarding/persona"
                    className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400"
                  >
                    Setup persona
                  </a>
                ) : (
                  <a
                    href="/settings/persona"
                    className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400"
                  >
                    Manage personas
                  </a>
                )}
              </div>
              {personasLoading ? (
                <div className="mt-2 h-10 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
              ) : personas.length === 0 ? (
                <div className="mt-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-center dark:border-zinc-700 dark:bg-zinc-900/50">
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    No personas configured. Content will use default settings.
                  </p>
                </div>
              ) : (
                <div className="mt-2">
                  <select
                    value={formData.personaId || ""}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        personaId: e.target.value || null,
                      }))
                    }
                    className="block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  >
                    <option value="">Default settings</option>
                    {personas.map((persona) => (
                      <option key={persona.id} value={persona.id}>
                        {persona.name}
                        {persona.isDefault ? " (Default)" : ""}
                      </option>
                    ))}
                  </select>
                  {formData.personaId && (
                    <p className="mt-1 text-xs text-zinc-500">
                      {personas.find((p) => p.id === formData.personaId)?.bio ||
                        "Using custom voice settings"}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Title (Optional) */}
            <div>
              <label
                htmlFor="title"
                className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Title <span className="text-zinc-400">(optional)</span>
              </label>
              <input
                id="title"
                name="title"
                type="text"
                value={formData.title}
                onChange={handleChange}
                className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                placeholder="My awesome reel"
              />
              {errors.title && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                  {errors.title}
                </p>
              )}
            </div>

            {/* Prompt */}
            <div>
              <label
                htmlFor="prompt"
                className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                What should we create?
              </label>
              <textarea
                id="prompt"
                name="prompt"
                rows={6}
                value={formData.prompt}
                onChange={handleChange}
                className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                placeholder="Describe your reel... e.g., A fun product demo for a sustainable water bottle targeting young professionals who care about the environment."
              />
              <div className="mt-1 flex justify-between text-xs text-zinc-500">
                <span>Min 10 characters</span>
                <span>{formData.prompt.length}/5000</span>
              </div>
              {errors.prompt && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                  {errors.prompt}
                </p>
              )}
            </div>

            {/* Variant Count */}
            <div>
              <label
                htmlFor="variantCount"
                className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Number of variants
              </label>
              <div className="mt-2 flex items-center gap-4">
                <input
                  id="variantCount"
                  name="variantCount"
                  type="range"
                  min="1"
                  max="5"
                  value={formData.variantCount}
                  onChange={handleChange}
                  className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-zinc-200 accent-blue-600 dark:bg-zinc-700"
                />
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                  {formData.variantCount}
                </span>
              </div>
              {errors.variantCount && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                  {errors.variantCount}
                </p>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg
                    className="animate-spin h-4 w-4"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Creating your reel...
                </span>
              ) : (
                "Create Reel"
              )}
            </button>
          </form>
        </div>

        {/* Tips */}
        <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Tips for better results
          </h3>
          <ul className="mt-2 space-y-1 text-sm text-zinc-600 dark:text-zinc-300">
            <li>• Be specific about your target audience</li>
            <li>• Include key points or talking points you want covered</li>
            <li>• Mention the tone (professional, fun, educational)</li>
            <li>• Specify any particular style or reference you have in mind</li>
          </ul>
        </div>
      </div>
    </AppShell>
  );
}
