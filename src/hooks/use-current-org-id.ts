"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";

const STORAGE_KEY = "currentOrgId";

export function useCurrentOrgId() {
  const searchParams = useSearchParams();
  const [orgId, setOrgIdState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const url = new URL(window.location.href);
      const fromQuery = url.searchParams.get("orgId");
      const fromStorage = window.localStorage.getItem(STORAGE_KEY);
      return fromQuery || fromStorage || null;
    } catch {
      return null;
    }
  });

  // Keep orgId in sync with URL changes (client-side navigations)
  useEffect(() => {
    if (!searchParams) return;
    const fromQuery = searchParams.get("orgId");
    if (fromQuery && fromQuery !== orgId) {
      setOrgId(fromQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const setOrgId = useCallback((value: string | null) => {
    setOrgIdState(value);
    if (typeof window !== "undefined") {
      try {
        if (value) {
          window.localStorage.setItem(STORAGE_KEY, value);
        } else {
          window.localStorage.removeItem(STORAGE_KEY);
        }
      } catch {}
    }
  }, []);

  return { orgId, setOrgId } as const;
}
