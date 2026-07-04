"use client";
import { Badge } from "@/components/ui/badge";
import type { NetworkPlan } from "@/lib/network-engine/types";

export function IpPlanView({ plan }: { plan: NetworkPlan }) {
  const subnets = plan.ipPlan?.subnets ?? [];
  const vlans = plan.vlanPlan ?? [];
  const routes = plan.routing?.routes ?? [];

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h2 className="font-display text-xl font-bold">IP &amp; VLAN Plan</h2>
          <p className="text-sm text-muted-foreground">
            Base {plan.ipPlan?.base} · {subnets.length} subnet(s) · {vlans.length || 1} VLAN(s) · Routing {plan.routing?.protocol}
          </p>
        </div>

        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Segment</th>
                <th className="px-4 py-3">CIDR</th>
                <th className="px-4 py-3">Mask</th>
                <th className="px-4 py-3">Usable range</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {subnets.map((s, i) => (
                <tr key={i} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{s.name}</td>
                  <td className="px-4 py-3 font-mono text-primary">{s.cidr}</td>
                  <td className="px-4 py-3 font-mono text-muted-foreground">{s.mask}</td>
                  <td className="px-4 py-3 font-mono text-muted-foreground">{s.range}</td>
                </tr>
              ))}
              {subnets.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No subnets</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {vlans.length > 0 && (
          <div>
            <h3 className="mb-2 font-display font-semibold">VLANs</h3>
            <div className="flex flex-wrap gap-2">
              {vlans.map((v) => (
                <Badge key={v.id} variant="secondary" className="gap-1.5 py-1.5">
                  <span className="font-mono">VLAN {v.id}</span> · {v.name} · <span className="font-mono">{v.subnet}</span>
                </Badge>
              ))}
            </div>
          </div>
        )}

        {routes.length > 0 && (
          <div>
            <h3 className="mb-2 font-display font-semibold">Routing ({plan.routing.protocol})</h3>
            <pre className="overflow-x-auto rounded-xl border bg-muted/30 p-4 text-xs sm:text-sm">{routes.join("\n")}</pre>
          </div>
        )}
      </div>
    </div>
  );
}