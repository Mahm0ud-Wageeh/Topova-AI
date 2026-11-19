import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { apiRequest } from "@/api/client";
import type {
  ConversationDetail,
  ConversationWorkspaceState,
} from "./workspace-types";
interface SaveJob {
  state: ConversationWorkspaceState;
  version: number;
  running?: Promise<void>;
  timer?: ReturnType<typeof setTimeout>;
  error?: string;
}

export function useWorkspaceSave(
  conversation: ConversationDetail | null,
  setConversation: Dispatch<SetStateAction<ConversationDetail | null>>,
) {
  const jobs = useRef(new Map<string, SaveJob>());
  const current = useRef(conversation);
  current.current = conversation;
  const [, render] = useState(0);
  const mounted = useRef(true);
  const notify = useCallback(() => {
    if (mounted.current) render((n) => n + 1);
  }, []);
  const flush = useCallback(
    async (id = current.current?.id): Promise<void> => {
      if (!id) return;
      const job = jobs.current.get(id);
      if (!job) return;
      clearTimeout(job.timer);
      if (job.running) return job.running;
      const state = job.state;
      job.error = undefined;
      job.running = (async () => {
        try {
          const response = await apiRequest<{
            conversation: ConversationDetail;
          }>(`/api/v1/conversations/${id}`, {
            method: "PATCH",
            body: {
              workspaceState: state,
              expectedVersion: job.version,
              note: "Canvas edit",
            },
          });
          job.version = response.conversation.version ?? job.version + 1;
          if (mounted.current)
            setConversation((previous) =>
              previous?.id === id
                ? {
                    ...response.conversation,
                    messages: previous.messages,
                    workspaceState: job.state,
                    olderBefore: previous.olderBefore,
                    totalMessages: previous.totalMessages,
                  }
                : previous,
            );
          if (job.state === state) jobs.current.delete(id);
        } catch (error) {
          job.error =
            error instanceof Error ? error.message : "Could not save design.";
          throw error;
        } finally {
          job.running = undefined;
          notify();
        }
      })();
      notify();
      await job.running;
      if (jobs.current.has(id) && !job.error) await flush(id);
    },
    [notify, setConversation],
  );
  const update = useCallback(
    (state: ConversationWorkspaceState) => {
      const active = current.current;
      if (!active || active.id === "draft") return;
      const job = jobs.current.get(active.id) ?? {
        state,
        version: active.version ?? 1,
      };
      job.state = state;
      job.error = undefined;
      clearTimeout(job.timer);
      jobs.current.set(active.id, job);
      setConversation((previous) =>
        previous?.id === active.id
          ? { ...previous, workspaceState: state }
          : previous,
      );
      job.timer = setTimeout(() => {
        void flush(active.id).catch(() => {});
      }, 450);
      notify();
    },
    [flush, notify, setConversation],
  );
  useEffect(() => {
    mounted.current = true;
    const pendingJobs = jobs.current;
    const warn = (event: BeforeUnloadEvent) => {
      if (jobs.current.size) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      mounted.current = false;
      window.removeEventListener("beforeunload", warn);
      for (const [id, job] of pendingJobs) {
        clearTimeout(job.timer);
        void flush(id).catch(() => {});
      }
    };
  }, [flush]);
  const discard = useCallback(async () => {
    const id = current.current?.id;
    if (!id) return;
    const job = jobs.current.get(id);
    if (job?.running) await job.running.catch(() => {});
    const response = await apiRequest<{ conversation: ConversationDetail }>(
      `/api/v1/conversations/${id}`,
    );
    if (job) clearTimeout(job.timer);
    jobs.current.delete(id);
    setConversation((previous) =>
      previous?.id === id ? response.conversation : previous,
    );
    notify();
  }, [notify, setConversation]);
  const job = conversation ? jobs.current.get(conversation.id) : undefined;
  return {
    update,
    flush,
    discard,
    status: job?.error
      ? ("error" as const)
      : job
        ? ("saving" as const)
        : ("saved" as const),
    error: job?.error,
  };
}
