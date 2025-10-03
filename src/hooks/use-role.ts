import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/use-auth";

export interface UserRoleInfo {
  role?: "admin" | "member";
  isAdmin: boolean;
  isLoading: boolean;
}

export function useRole(): UserRoleInfo {
  const { user } = useAuth();
  const [role, setRole] = useState<"admin" | "member" | undefined>(undefined);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!user?.uid) {
        setRole(undefined);
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        const ref = doc(db, "users", user.uid);
        const snap = await getDoc(ref);
        const r =
          (snap.get("role") as "admin" | "member" | undefined) || undefined;
        if (!cancelled) setRole(r);
      } catch {
        if (!cancelled) setRole(undefined);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  return { role, isAdmin: role === "admin", isLoading } as UserRoleInfo;
}

