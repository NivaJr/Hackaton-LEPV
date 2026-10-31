import type { ReactNode } from "react";

// Real dashboards always resolve authentication at request time, including deployments built without secrets.
export const dynamic = "force-dynamic";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return children;
}
