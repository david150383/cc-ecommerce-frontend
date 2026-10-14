import { useInfiniteQuery } from "@tanstack/react-query";
import type { CursorPage } from "../../api/orders";

/** Cursor-paged admin lists ("Load more"). */
export function useCursorList<T>(key: unknown[], fetchPage: (cursor?: string) => Promise<CursorPage<T>>) {
  const q = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.page.nextCursor ?? undefined,
  });
  return { ...q, items: q.data?.pages.flatMap((p) => p.data) ?? [] };
}

export const shortId = (id: string | null) => (id ? id.slice(-8).toUpperCase() : "—");
export const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }) : "—");
