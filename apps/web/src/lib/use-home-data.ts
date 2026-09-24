"use client";

import { useEffect, useState } from "react";
import type { HomeResponse } from "@homebase/api-contracts";
import { fetchHome } from "./api-client";

type State = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; response: HomeResponse };

export function useHomeData() {
  const [state, setState] = useState<State>({ status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      try {
        const response = await fetchHome(controller.signal);
        if (!controller.signal.aborted) setState({ status: "ready", response });
      } catch (error) {
        if (!controller.signal.aborted)
          setState((previous) =>
            previous.status === "ready"
              ? { status: "ready", response: { data: { ...previous.response.data, stale: true } } }
              : { status: "error", message: error instanceof Error ? error.message : "Refresh failed" },
          );
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(refresh, 15000);
      }
    };
    void refresh();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, []);
  return state;
}
