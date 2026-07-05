"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <div className="max-w-md text-center">
        <p className="mb-2 font-mono text-5xl font-bold text-primary">Error</p>
        <h1 className="font-display text-xl font-bold">Workspace error</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {error.message || "Failed to load the workspace."}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button onClick={reset} size="sm">
            Try again
          </Button>
          <Button onClick={() => router.push("/dashboard")} variant="outline" size="sm">
            Back to dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
