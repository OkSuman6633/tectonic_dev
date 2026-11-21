/** External data connectors (Meta Ads, Google Analytics 4, ...) — shapes of the /connectors API. */

export interface CredentialFieldSpec {
  name: string;
  label: string;
  /** Secret values are never shown again and never reach the AI model. */
  secret: boolean;
  required: boolean;
  kind: 'password' | 'text' | 'textarea' | 'file';
  placeholder: string;
  help: string;
  pattern: string | null;
  accept: string | null;
}

export interface AuthSchemeSpec {
  id: string;
  label: string;
  instructions: string;
  fields: CredentialFieldSpec[];
}

export interface ConnectorSpec {
  name: string;
  label: string;
  description: string;
  tool_prefix: string;
  docs_url: string;
  auth_schemes: AuthSchemeSpec[];
  capabilities: { name: string; kind: 'read' | 'write'; description: string }[];
}

export interface ConnectionSummary {
  connector: string;
  connection: string;
  status: 'active' | 'invalid' | 'not_connected';
  scheme?: string;
  /** Non-secret inputs (ad account id, property id). */
  fields?: Record<string, string>;
  /** Names of the secret inputs that are stored (values are never returned). */
  secret_fields?: string[];
  profile?: Record<string, unknown>;
  error?: string | null;
  connected_at?: number;
  expires_at?: number;
}

/** A data problem an agent hit while fetching from a connector (shown as a pop-up in the chat). */
export interface ConnectorNotice {
  seq: number;
  kind: 'not_connected' | 'connection_failed' | 'fetch_failed' | 'no_data';
  team: string | null;
  agent: string;
  connector: string;
  label: string;
  connection: string;
  /** The tool that was called, e.g. meta_ads_insights. */
  what: string;
  message: string;
  at: number;
}

export interface ConnectorNoticeView {
  notice: ConnectorNotice;
  project: string;
  /** Agent the chat continues after connecting (directory id in the Builder chat; absent in the sandbox). */
  target?: string;
  /** The user asked the agent to continue after connecting. */
  continued?: boolean;
}
