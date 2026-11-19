import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiRequest } from "@/api/client";
import type {
  ConversationDetail,
  ConversationWorkspaceState,
} from "@/components/workspace/workspace-types";
import { useLanguage } from "@/context/language-context";
import type {
  AclRule,
  BuiltTopology,
  NetworkPlan,
} from "@/lib/network-engine/types";

export function LegacyProjectPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const { project } = await apiRequest<{
        project: {
          name: string;
          devices: BuiltTopology["devices"];
          connections: BuiltTopology["connections"];
          layout?: BuiltTopology["layout"];
          network_plan: NetworkPlan;
          acls: AclRule[];
        };
      }>(`/api/v1/projects/${encodeURIComponent(projectId ?? "")}`, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const workspaceState: ConversationWorkspaceState = {
        projectName: project.name,
        topology: {
          devices: project.devices,
          connections: project.connections,
          layout: project.layout ?? {},
        },
        plan: project.network_plan,
        acls: project.acls ?? [],
      };
      const { conversation } = await apiRequest<{
        conversation: ConversationDetail;
      }>("/api/v1/conversations", {
        body: { title: project.name, workspaceState },
        signal: controller.signal,
      });
      if (!controller.signal.aborted)
        navigate(`/chat/${conversation.id}`, { replace: true });
    })().catch(() => {
      if (!controller.signal.aborted) setError(true);
    });
    return () => controller.abort();
  }, [projectId, navigate]);
  return (
    <main className="grid min-h-screen place-content-center gap-4 p-6 text-center">
      <p role={error ? "alert" : "status"}>
        {error
          ? t(
              "تعذر فتح المشروع. تأكد من الحساب واتصالك ثم أعد المحاولة.",
              "Could not open this project. Check your account and connection, then retry.",
            )
          : t("جارٍ فتح مشروعك…", "Opening your project…")}
      </p>
      {error && (
        <Link to="/chat">{t("العودة للمحادثات", "Back to conversations")}</Link>
      )}
    </main>
  );
}
