import { createContext, useContext, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { createDefaultTables, type DataTable } from "../core/dataTables";

interface TablesContextValue {
  tables: DataTable[];
  setTables: Dispatch<SetStateAction<DataTable[]>>;
}

const TablesContext = createContext<TablesContextValue | null>(null);

export function TablesProvider({ children }: { children: ReactNode }) {
  const [tables, setTables] = useState<DataTable[]>(createDefaultTables);
  const value = useMemo(() => ({ tables, setTables }), [tables]);
  return <TablesContext.Provider value={value}>{children}</TablesContext.Provider>;
}

export function useTables(): TablesContextValue {
  const context = useContext(TablesContext);
  if (!context) {
    throw new Error("useTables must be used within a TablesProvider");
  }

  return context;
}
