import Link from "next/link";
import { Network } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <div className="max-w-md text-center">
        <span className="grid mx-auto h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-primary to-cyan text-primary-foreground shadow-glow mb-6">
          <Network className="h-8 w-8" />
        </span>
        <p className="mb-2 font-mono text-6xl font-bold text-primary">404</p>
        <h1 className="font-display text-2xl font-bold">Page not found</h1>
        <p className="mt-2 text-muted-foreground">
          The page you are looking for does not exist or has been moved.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button asChild>
            <Link href="/">Go home</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard">Dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
