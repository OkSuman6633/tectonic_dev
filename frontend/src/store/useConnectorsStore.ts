import { create } from 'zustand';
import { disconnectDataSource, fetchConnections, fetchConnectorCatalog } from '../services/connectorsApi';
import type { ConnectionSummary, ConnectorSpec } from '../types/connectors';

/** The account's external data sources: shared by the External Tools window and the chat's data notices. */
interface ConnectorsState {
  catalog: ConnectorSpec[];
  connections: ConnectionSummary[];
  loaded: boolean;
  error: string | null;
  load: () => Promise<void>;
  disconnect: (connector: string, connection?: string) => Promise<void>;
  /** The active connection of a data source, if any. */
  active: (connector: string, connection?: string) => ConnectionSummary | undefined;
}

export const useConnectorsStore = create<ConnectorsState>()((set, get) => ({
  catalog: [],
  connections: [],
  loaded: false,
  error: null,

  load: async () => {
    try {
      const [catalog, connections] = await Promise.all([fetchConnectorCatalog(), fetchConnections()]);
      set({ catalog, connections, loaded: true, error: null });
    } catch (err: any) {
      set({ loaded: true, error: err?.message || 'Could not load external tools' });
    }
  },

  disconnect: async (connector, connection = 'default') => {
    await disconnectDataSource(connector, connection);
    await get().load();
  },

  active: (connector, connection = 'default') =>
    get().connections.find((c) => c.connector === connector && c.connection === connection && c.status === 'active'),
}));
