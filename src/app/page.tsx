"use client";

import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-semibold">Welcome to AxonAI</h1>
        <p className="text-muted-foreground">Choose where to go:</p>
        <div className="flex items-center justify-center gap-3">
          <Link href="/dashboard" className="underline">
            Open Dashboard
          </Link>
          <span className="text-muted-foreground">or</span>
          <Link href="/login" className="underline">
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
