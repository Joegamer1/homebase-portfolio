"use client";
import { ErrorState } from "@/components/ui/data-state";
export default function ErrorPage({ error }: { error: Error }) {
  return <ErrorState message={error.message} />;
}
