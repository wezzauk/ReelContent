"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { AppShell } from "@/components/AppShell";

interface Asset {
  id: string;
  title: string | null;
  content: string | null;
  platform: string | null;
  tags: string[];
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface AssetsResponse {
  success: boolean;
  data: Asset[];
  nextCursor?: string;
}

const fetcher = async (url: string): Promise<AssetsResponse> => {
  const token = getAuthToken();
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error?.message || "Failed to fetch");
  }
  return res.json();
};

function getAuthToken(): string | null {
  if (typeof document === "undefined") return null;
  return (
    document.cookie
      .split("; ")
      .find((row) => row.startsWith("auth_token="))
      ?.split("=")[1] || null
  );
}

function getPlatformIcon(platform: string | null): string {
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

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

interface FilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  platform: string;
  onPlatformChange: (value: string) => void;
  status: string;
  onStatusChange: (value: string) => void;
}

function FilterBar({
  search,
  onSearchChange,
  platform,
  onPlatformChange,
  status,
  onStatusChange,
}: FilterBarProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {/* Search */}
      <div className="relative flex-1 max-w-md">
        <input
          type="text"
          placeholder="Search assets..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full rounded-lg border border-zinc-200 bg-white px-4 py-2 pl-10 text-sm placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <svg
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <select
          value={platform}
          onChange={(e) => onPlatformChange(e.target.value)}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        >
          <option value="">All Platforms</option>
          <option value="tiktok">TikTok</option>
          <option value="instagram_reels">Reels</option>
          <option value="youtube_shorts">Shorts</option>
        </select>

        <select
          value={status}
          onChange={(e) => onStatusChange(e.target.value)}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        >
          <option value="">All Status</option>
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </select>
      </div>
    </div>
  );
}

interface AssetCardProps {
  asset: Asset;
  onCopy: (content: string) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
}

function AssetCard({ asset, onCopy, onArchive, onDelete }: AssetCardProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg">{getPlatformIcon(asset.platform)}</span>
          <h3 className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {asset.title || "Untitled Asset"}
          </h3>
        </div>

        <div className="relative">
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
              />
            </svg>
          </button>

          {isMenuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setIsMenuOpen(false)} />
              <div className="absolute right-0 top-full z-20 mt-1 w-36 rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                <button
                  onClick={() => {
                    if (asset.content) onCopy(asset.content);
                    setIsMenuOpen(false);
                  }}
                  className="block w-full px-4 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Copy content
                </button>
                <button
                  onClick={() => {
                    onArchive(asset.id);
                    setIsMenuOpen(false);
                  }}
                  className="block w-full px-4 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Archive
                </button>
                <button
                  onClick={() => {
                    onDelete(asset.id);
                    setIsMenuOpen(false);
                  }}
                  className="block w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                >
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {asset.content && (
          <p className="line-clamp-3 text-sm text-zinc-600 dark:text-zinc-300">
            {asset.content}
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 px-4 py-3 dark:border-zinc-800">
        {/* Tags */}
        {asset.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {asset.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
              >
                {tag}
              </span>
            ))}
            {asset.tags.length > 3 && (
              <span className="text-xs text-zinc-400">+{asset.tags.length - 3}</span>
            )}
          </div>
        )}

        <div className="flex-1" />

        {/* Status badge */}
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            asset.status === "active"
              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
              : asset.status === "archived"
              ? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
              : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
          }`}
        >
          {asset.status}
        </span>

        {/* Date */}
        <span className="text-xs text-zinc-400">{formatDate(asset.createdAt)}</span>
      </div>
    </div>
  );
}

interface LoadMoreProps {
  onLoadMore: () => void;
  isLoading: boolean;
  hasMore: boolean;
}

function LoadMore({ onLoadMore, isLoading, hasMore }: LoadMoreProps) {
  if (!hasMore) return null;

  return (
    <div className="mt-6 flex justify-center">
      <button
        onClick={onLoadMore}
        disabled={isLoading}
        className="rounded-lg border border-zinc-200 bg-white px-6 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        {isLoading ? "Loading..." : "Load more"}
      </button>
    </div>
  );
}

function LibraryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [platform, setPlatform] = useState(searchParams.get("platform") || "");
  const [status, setStatus] = useState(searchParams.get("status") || "");
  const [cursor, setCursor] = useState<string | undefined>();
  const [allAssets, setAllAssets] = useState<Asset[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Build query string
  const buildQueryString = useCallback(
    (extraParams?: Record<string, string>) => {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      if (platform) params.set("platform", platform);
      if (status) params.set("status", status);
      if (extraParams) {
        Object.entries(extraParams).forEach(([key, value]) => {
          if (value) params.set(key, value);
        });
      }
      return params.toString();
    },
    [search, platform, status]
  );

  // Initial load
  const queryString = buildQueryString();
  const { data, error, isLoading, mutate } = useSWR<AssetsResponse>(
    `/api/v1/library/assets?${queryString}`,
    fetcher,
    {
      revalidateOnFocus: false,
    }
  );

  // Reset when filters change
  useEffect(() => {
    setAllAssets([]);
    setCursor(undefined);
    setHasMore(true);
    mutate();
  }, [search, platform, status, mutate]);

  // Update allAssets when data changes
  useEffect(() => {
    if (data?.data) {
      setAllAssets(data.data);
      setHasMore(!!data.nextCursor);
      setCursor(data.nextCursor);
    }
  }, [data]);

  const handleLoadMore = async () => {
    if (!cursor || isLoadingMore) return;

    setIsLoadingMore(true);
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/v1/library/assets?${buildQueryString({ cursor })}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (res.ok) {
        const newData: AssetsResponse = await res.json();
        setAllAssets((prev) => [...prev, ...newData.data]);
        setHasMore(!!newData.nextCursor);
        setCursor(newData.nextCursor);
      }
    } catch (err) {
      console.error("Failed to load more:", err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content);
  };

  const handleArchive = async (assetId: string) => {
    const token = getAuthToken();
    if (!token) {
      router.push("/login");
      return;
    }

    try {
      const res = await fetch(`/api/v1/library/assets/${assetId}/archive`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        mutate();
      }
    } catch (err) {
      console.error("Failed to archive:", err);
    }
  };

  const handleDelete = async (assetId: string) => {
    const token = getAuthToken();
    if (!token) {
      router.push("/login");
      return;
    }

    if (!confirm("Are you sure you want to delete this asset?")) return;

    try {
      const res = await fetch(`/api/v1/library/assets/${assetId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        mutate();
      }
    } catch (err) {
      console.error("Failed to delete:", err);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">Loading assets...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-900/20">
        <p className="text-sm text-red-600 dark:text-red-400">
          Failed to load assets. Please try again.
        </p>
      </div>
    );
  }

  const assets = allAssets;

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Library
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
          View and manage your saved content
        </p>
      </div>

      {/* Filters */}
      <div className="mb-6">
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          platform={platform}
          onPlatformChange={setPlatform}
          status={status}
          onStatusChange={setStatus}
        />
      </div>

      {/* Assets grid */}
      {assets.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-8 text-center dark:border-zinc-800 dark:bg-zinc-900/50">
          <div className="text-4xl">📁</div>
          <p className="mt-2 text-zinc-600 dark:text-zinc-300">No assets found</p>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Save content from your drafts to build your library
          </p>
          <button
            onClick={() => router.push("/dashboard")}
            className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Go to Dashboard
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {assets.map((asset) => (
            <AssetCard
              key={asset.id}
              asset={asset}
              onCopy={handleCopy}
              onArchive={handleArchive}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Load more */}
      <LoadMore
        onLoadMore={handleLoadMore}
        isLoading={isLoadingMore}
        hasMore={hasMore}
      />
    </div>
  );
}

export default function LibraryPage() {
  return (
    <AppShell activeHref="/library">
      <Suspense fallback={<LibraryLoading />}>
        <LibraryContent />
      </Suspense>
    </AppShell>
  );
}

function LibraryLoading() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="animate-pulse rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 h-48" />
      ))}
    </div>
  );
}
