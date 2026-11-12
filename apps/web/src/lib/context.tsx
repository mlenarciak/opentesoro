import { createContext, useContext, useState, type ReactNode } from "react";
const ScopeContext = createContext<{
  entityId: string;
  setEntityId: (id: string) => void;
}>({ entityId: "all", setEntityId: () => {} });
export function ScopeProvider({ children }: { children: ReactNode }) {
  const [entityId, setEntityId] = useState("all");
  return (
    <ScopeContext.Provider value={{ entityId, setEntityId }}>
      {children}
    </ScopeContext.Provider>
  );
}
export const useScope = () => useContext(ScopeContext);
export const scopeRows = <T extends { entityId: string }>(
  rows: T[],
  entityId: string,
) =>
  entityId === "all" ? rows : rows.filter((row) => row.entityId === entityId);
