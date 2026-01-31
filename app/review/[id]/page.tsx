"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import useSWR from "swr";
import { AppShell } from "@/components/AppShell";
import { ContentListCard, type ContentRow } from "@/components/ContentListCard";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error?.message || "Failed to fetch");
  }
  return res.json();
};

interface Variant {
  id: string;
  variantIndex: number;
  content: string;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  hashtags: string[];
  aiDisclaimer: string;
  nanobananaPrompt: string;
  createdAt: string;
}

interface Generation {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  errorMessage: string | null;
  isRegen: boolean;
  variants: Variant[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  polling?: {
    suggestedIntervalMs: number;
    estimatedWaitMs: number;
  };
}

interface Draft {
  id: string;
  title: string | null;
  prompt: string;
  platform: string;
  createdAt: string;
  updatedAt: string;
}

interface ReviewData {
  draft: Draft;
  generation: Generation;
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "Queued";
    case "processing":
      return "Processing";
    case "completed":
      return "Ready";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case "pending":
      return "text-yellow-600 bg-yellow-50 dark:text-yellow-400 dark:bg-yellow-900/20";
    case "processing":
      return "text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/20";
    case "completed":
      return "text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-900/20";
    case "failed":
      return "text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-900/20";
    default:
      return "text-zinc-600 bg-zinc-50 dark:text-zinc-400 dark:bg-zinc-900/20";
  }
}

function getPlatformIcon(platform: string): string {
  switch (platform) {
    case "tiktok":
      return "🎵";
    case "instagram_reels":
      return "📸";
    case "youtube_shorts":
      return "▶️";
    default:
      return "📹";
  }
}

function getAuthToken(): string | null {
  if (typeof document === "undefined") return null;
  return (
    document.cookie
      .split("; ")
      .find((row) => row.startsWith("auth_token="))
      ?.split("=")[1] || null
  );
}

interface RegenerateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRegenerate: (regenType: "targeted" | "full", changes?: string) => Promise<void>;
  isLoading: boolean;
}

function RegenerateModal({ isOpen, onClose, onRegenerate, isLoading }: RegenerateModalProps) {
  const [regenType, setRegenType] = useState<"targeted" | "full">("targeted");
  const [changes, setChanges] = useState("");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Regenerate Content
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
          Choose how you want to regenerate this content.
        </p>

        <div className="mt-4 space-y-3">
          {/* Regeneration Type */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Regeneration Type
            </label>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRegenType("targeted")}
                className={`rounded-lg border p-3 text-sm transition-colors ${
                  regenType === "targeted"
                    ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-900/20 dark:text-blue-300"
                    : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-600"
                }`}
              >
                <div className="font-medium">Targeted</div>
                <div className="mt-1 text-xs text-zinc-500">
                  Small tweaks only
                </div>
              </button>
              <button
                type="button"
                onClick={() => setRegenType("full")}
                className={`rounded-lg border p-3 text-sm transition-colors ${
                  regenType === "full"
                    ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-900/20 dark:text-blue-300"
                    : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-600"
                }`}
              >
                <div className="font-medium">Full</div>
                <div className="mt-1 text-xs text-zinc-500">
                  Completely new version
                </div>
              </button>
            </div>
          </div>

          {/* Changes for targeted regen */}
          {regenType === "targeted" && (
            <div>
              <label
                htmlFor="changes"
                className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                What should be different?
              </label>
              <textarea
                id="changes"
                rows={3}
                value={changes}
                onChange={(e) => setChanges(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                placeholder="e.g., Make it more casual, add more emojis, shorter intro..."
              />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onRegenerate(regenType, regenType === "targeted" ? changes : undefined)}
            disabled={isLoading}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isLoading ? "Regenerating..." : "Regenerate"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface SaveToLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (title: string, tags: string[]) => Promise<void>;
  isLoading: boolean;
  variantContent: string;
  error?: string | null;
}

function SaveToLibraryModal({ isOpen, onClose, onSave, isLoading, variantContent, error, variantHashtags, variantAiDisclaimer }: SaveToLibraryModalProps & { variantHashtags?: string[]; variantAiDisclaimer?: string }) {
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");

  useEffect(() => {
    if (isOpen) {
      setTitle("");
      setTags("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Save to Library
        </h2>

        {/* Preview */}
        <div className="mt-4 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900">
          <p className="text-sm text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap">
            {variantContent}
          </p>
          {variantHashtags && variantHashtags.length > 0 && (
            <p className="mt-2 text-sm text-blue-600 dark:text-blue-400">
              {variantHashtags.map(tag => `#${tag}`).join(' ')}
            </p>
          )}
          {variantAiDisclaimer && (
            <p className="mt-1 text-xs text-zinc-500 italic">
              ({variantAiDisclaimer})
            </p>
          )}
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="assetTitle"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Title
            </label>
            <input
              id="assetTitle"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              placeholder="My saved reel"
            />
          </div>

          <div>
            <label
              htmlFor="assetTags"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Tags <span className="text-zinc-400">(comma-separated)</span>
            </label>
            <input
              id="assetTags"
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              placeholder="marketing, summer, product"
            />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(title, tags.split(",").map((t) => t.trim()).filter(Boolean))}
            disabled={isLoading}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
          >
            {isLoading ? "Saving..." : "Save to Library"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReviewContent() {
  const params = useParams();
  const router = useRouter();
  const draftId = params.id as string | undefined;

  const [regenerateModalOpen, setRegenerateModalOpen] = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Fetch draft list or single draft
  const { data: draftsData, error: draftsError, isLoading: draftsLoading, mutate: mutateDrafts } = useSWR(
    draftId ? null : "/api/jobs?status=processing,needs_review,completed",
    fetcher
  );

  // Fetch single draft+generation if we have an ID
  const { data: reviewData, error: reviewError, isLoading: reviewLoading, mutate: mutateReview } = useSWR(
    draftId ? [`/api/v1/drafts/${draftId}`, draftId] : null,
    async ([url]) => {
      // Fetch draft (which now includes generation data)
      const token = getAuthToken();
      const draftRes = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      
      if (!draftRes.ok) throw new Error("Draft not found");
      const draftData = await draftRes.json();
      
      // The draft API now includes generation data
      if (!draftData.data.generation) {
        throw new Error("Generation not found");
      }
      
      return {
        draft: draftData.data,
        generation: draftData.data.generation
      };
    },
    {
      refreshInterval: (data) => {
        if (!data) return 0;
        const { generation } = data;
        if (generation && (generation.status === "pending" || generation.status === "processing")) {
          return generation.polling?.suggestedIntervalMs || 2000;
        }
        return 0;
      },
    }
  );

  const handleRegenerate = async (regenType: "targeted" | "full", changes?: string) => {
    setIsRegenerating(true);
    setRegenError(null);

    try {
      const token = getAuthToken();

      const response = await fetch("/api/v1/regenerate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          draftId,
          regenType,
          changes,
          variantCount: 1,
        }),
      });

      // Handle 401 - redirect to login
      if (response.status === 401) {
        router.push("/login");
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        setRegenError(data.error?.message || "Failed to regenerate");
        return;
      }

      setRegenerateModalOpen(false);
      mutateReview();
    } catch {
      setRegenError("Network error. Please try again.");
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleSaveToLibrary = async (title: string, tags: string[]) => {
    if (!selectedVariant) return;

    setIsSaving(true);
    setSaveError(null);

    try {
      const token = getAuthToken();

      const response = await fetch("/api/v1/library/assets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          draftId,
          variantId: selectedVariant.id,
          title: title || undefined,
          tags,
        }),
      });

      // Handle 401 - redirect to login
      if (response.status === 401) {
        router.push("/login");
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        setSaveError(data.error?.message || "Failed to save");
        return;
      }

      setSaveModalOpen(false);
      setSelectedVariant(null);
      // Show success feedback
      alert("Saved to library!");
    } catch {
      setSaveError("Network error. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  // Single draft view
  if (draftId) {
    if (reviewLoading) {
      return (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">Loading...</p>
          </div>
        </div>
      );
    }

    if (reviewError || !reviewData) {
      return (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-900/20">
          <p className="text-sm text-red-600 dark:text-red-400">
            Failed to load draft. It may have been deleted or you don&apos;t have access.
          </p>
          <button
            onClick={() => router.push("/review")}
            className="mt-3 text-sm font-medium text-blue-600 hover:text-blue-500"
          >
            ← Back to all drafts
          </button>
        </div>
      );
    }

    const { draft, generation } = reviewData;

    return (
      <div>
        {/* Back button */}
        <button
          onClick={() => router.push("/review")}
          className="mb-4 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          ← Back to all drafts
        </button>

        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              {draft.title || "Untitled Draft"}
            </h1>
            <div className="mt-1 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
              <span>{getPlatformIcon(draft.platform)} {draft.platform.replace("_", " ")}</span>
              <span>•</span>
              <span>Created {new Date(draft.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setRegenerateModalOpen(true)}
              disabled={generation.status === "pending" || generation.status === "processing"}
              className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
            >
              Regenerate
            </button>
          </div>
        </div>

        {/* Status */}
        <div className="mb-6 flex items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-sm font-medium ${getStatusColor(generation.status)}`}>
            {getStatusLabel(generation.status)}
          </span>
          {generation.status === "pending" && generation.polling && (
            <span className="text-sm text-zinc-500">
              (~{Math.round(generation.polling.estimatedWaitMs / 1000)}s remaining)
            </span>
          )}
        </div>

        {/* Error message */}
        {generation.errorMessage && (
          <div className="mb-6 rounded-lg bg-red-50 p-4 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
            <strong>Error:</strong> {generation.errorMessage}
          </div>
        )}

        {/* Prompt */}
        <div className="mb-6 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">PROMPT</h2>
          <p className="mt-2 text-zinc-900 dark:text-zinc-100">{draft.prompt}</p>
        </div>

        {/* Variants */}
        <div className="mb-6">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Variants ({generation.variants.length})
          </h2>

          {generation.variants.length === 0 ? (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-8 text-center dark:border-zinc-800 dark:bg-zinc-900/50">
              <p className="text-zinc-600 dark:text-zinc-300">No variants yet. Waiting for generation...</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {generation.variants.map((variant: Variant) => (
                <div
                  key={variant.id}
                  className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
                >
                  {/* Video placeholder / thumbnail */}
                  <div className="aspect-video w-full bg-zinc-100 flex items-center justify-center dark:bg-zinc-900">
                    {variant.videoUrl ? (
                      <video
                        src={variant.videoUrl}
                        controls
                        className="h-full w-full object-cover"
                        preload="metadata"
                      />
                    ) : variant.thumbnailUrl ? (
                      <img
                        src={variant.thumbnailUrl}
                        alt={`Variant ${variant.variantIndex}`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-4xl">🎬</span>
                    )}
                  </div>

                  {/* Content */}
                  <div className="p-4">
                    <p className="text-sm text-zinc-900 dark:text-zinc-100 whitespace-pre-wrap">
                      {variant.content}
                    </p>

                    {/* Hashtags */}
                    {variant.hashtags && variant.hashtags.length > 0 && (
                      <p className="mt-2 text-sm text-blue-600 dark:text-blue-400">
                        {variant.hashtags.map(tag => `#${tag}`).join(' ')}
                      </p>
                    )}

                    {/* AI Disclaimer */}
                    {variant.aiDisclaimer && (
                      <p className="mt-2 text-xs text-zinc-500 italic">
                        {variant.aiDisclaimer}
                      </p>
                    )}

                    {/* Nanobanana Prompt */}
                    {variant.nanobananaPrompt && (
                      <div className="mt-3 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900">
                        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">NANOBANANA PRO PROMPT</p>
                        <p className="mt-1 text-xs text-zinc-700 dark:text-zinc-300 break-words">
                          {variant.nanobananaPrompt}
                        </p>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="mt-4 flex gap-2">
                      <button
                        onClick={() => {
                          setSelectedVariant(variant);
                          setSaveModalOpen(true);
                        }}
                        className="flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                      >
                        Save to Library
                      </button>
                      <button
                        onClick={() => {
                          const fullContent = [
                            variant.content,
                            '',
                            variant.hashtags.length > 0 ? variant.hashtags.map(t => `#${t}`).join(' ') : '',
                            variant.aiDisclaimer ? `(${variant.aiDisclaimer})` : '',
                          ].filter(Boolean).join('\n');
                          navigator.clipboard.writeText(fullContent);
                        }}
                        className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Regeneration Error */}
        {regenError && (
          <div className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {regenError}
          </div>
        )}

        {/* Modals */}
        <RegenerateModal
          isOpen={regenerateModalOpen}
          onClose={() => setRegenerateModalOpen(false)}
          onRegenerate={handleRegenerate}
          isLoading={isRegenerating}
        />

        <SaveToLibraryModal
          isOpen={saveModalOpen}
          onClose={() => {
            setSaveModalOpen(false);
            setSaveError(null);
          }}
          onSave={handleSaveToLibrary}
          isLoading={isSaving}
          variantContent={selectedVariant?.content || ""}
          variantHashtags={selectedVariant?.hashtags}
          variantAiDisclaimer={selectedVariant?.aiDisclaimer}
          error={saveError}
        />
      </div>
    );
  }

  // List view - show all drafts
  const drafts = draftsData?.jobs || [];
  const rows: ContentRow[] = drafts.map((j: any) => ({
    id: j.id,
    title: j.title || "Untitled",
    subtitle: `${j.platform.toUpperCase()} • ${getStatusLabel(j.status)}`,
    status: j.status === "processing" ? "Processing" : j.status === "completed" ? "Ready" : j.status === "failed" ? "Needs Review" : "Processing",
  }));

  return (
    <ContentListCard
      title="Your Drafts"
      rows={
        draftsLoading
          ? [
              { id: "s1", title: "Loading…", subtitle: "Please wait" },
              { id: "s2", title: "Loading…", subtitle: "Please wait" },
            ]
          : drafts.length
          ? rows
          : [{ id: "empty", title: "No drafts yet", subtitle: "Create your first reel from the dashboard." }]
      }
      viewAllHref="/dashboard"
    />
  );
}

export default function ReviewPage() {
  return (
    <AppShell activeHref="/review">
      <ReviewContent />
    </AppShell>
  );
}
