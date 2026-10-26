"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type PollingError = {
  status: number | null;
};

export type PollingJsonState<T> = {
  data: T | null;
  initialLoading: boolean;
  error: PollingError | null;
  refreshFailed: boolean;
};

const initialState = {
  data: null,
  initialLoading: true,
  error: null,
  refreshFailed: false,
};

export function usePollingJson<T>(
  url: string,
  isData: (value: unknown) => value is T,
  intervalMs = 5_000,
  onData?: (data: T) => void,
) {
  const [state, setState] = useState<PollingJsonState<T>>(initialState);
  const inFlightRef = useRef(false);
  const generationRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const onDataRef = useRef(onData);

  useEffect(() => {
    onDataRef.current = onData;
  }, [onData]);
           
  const request = useCallback(async (showInitialLoading = false) => {
    if (inFlightRef.current) return;
    const generation = generationRef.current;
    const controller = new AbortController();
    controllerRef.current = controller;
    inFlightRef.current = true;

    if (showInitialLoading) {
      setState(initialState);
    }

    try {
      const response = await fetch(url, {
        cache: "no-store",
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) {
        if (generation !== generationRef.current) return;
        setState((current) =>
          current.data
            ? { ...current, refreshFailed: true }
            : {
                data: null,
                initialLoading: false,
                error: { status: response.status },
                refreshFailed: false,
              },
        );
        return;
      }

      const body = (await response.json()) as { data?: unknown };
      if (!isData(body.data)) {
        throw new Error("The response was not in the expected format.");
      }
      if (generation !== generationRef.current) return;
      onDataRef.current?.(body.data);
      setState({
        data: body.data,
        initialLoading: false,
        error: null,
        refreshFailed: false,
      });
    } catch (error) {
      if (
        generation === generationRef.current &&
        !(error instanceof DOMException && error.name === "AbortError")
      ) {
        setState((current) =>
          current.data
            ? { ...current, refreshFailed: true }
            : {
                data: null,
                initialLoading: false,
                error: { status: null },
                refreshFailed: false,
              },
        );
      }
    } finally {
      if (generation === generationRef.current) {
        inFlightRef.current = false;
      }
    }
  }, [isData, url]);

  useEffect(() => {
    generationRef.current += 1;
    controllerRef.current?.abort();
    inFlightRef.current = false;
    const initialTimer = setTimeout(() => void request(true), 0);

    return () => {
      clearTimeout(initialTimer);
      generationRef.current += 1;
      controllerRef.current?.abort();
      inFlightRef.current = false;
    };
  }, [request]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      if (!cancelled && document.visibilityState === "visible") {
        timer = setTimeout(run, intervalMs);
      }
    };

    const run = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      await request(false);
      schedule();
    };

    const handleVisibility = () => {
      if (timer) clearTimeout(timer);
      if (document.visibilityState === "visible") void run();
    };

    document.addEventListener("visibilitychange", handleVisibility);
    schedule();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [intervalMs, request]);

  const replaceData = useCallback((data: T) => {
    onDataRef.current?.(data);
    setState({
      data,
      initialLoading: false,
      error: null,
      refreshFailed: false,
    });
  }, []);

  return { state, refresh: request, replaceData };
}

