import type { BranchPlan, BranchRequest } from "@/lib/design/schema";
import type {
  AclRule,
  BuiltTopology,
  Connection,
  Device,
  NetworkPlan,
  ProjectRevision,
} from "@/lib/network-engine/types";

export type AgentWorkMode = "auto" | "architect" | "security" | "executive";
export type AccentTheme = "blue" | "cyan" | "emerald" | "violet";

export interface StoredUser {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: string;
}

export interface StoredProject {
  id: string;
  ownerId: string;
  name: string;
  description?: string;
  source: "PROMPT" | "MANUAL";
  prompt?: string;
  devices: Device[];
  connections: Connection[];
  layout?: Record<string, { x: number; y: number }>;
  network_plan: NetworkPlan;
  acls: AclRule[];
  revisions: ProjectRevision[];
  createdAt: string;
  updatedAt: string;
}

export interface ThinkingStep {
  title: string;
  detail: string;
  status: "done";
}

export interface ClarifyingQuestion {
  question: string;
  options: string[];
}

export interface ChatAttachment {
  name: string;
  mimeType?: string;
  content: string;
}

export type ExportCardKind =
  | "pt-guide"
  | "cisco-cfg"
  | "cml-yaml"
  | "gns3-project"
  | "cabling-csv"
  | "pdf-report"
  | "pt-pack";

export interface ChatExportCard {
  id: ExportCardKind;
  format: string;
  titleAr: string;
  titleEn: string;
  descAr: string;
  descEn: string;
  recommended?: boolean;
}

export interface StoredChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  mode?: AgentWorkMode;
  thinkingSteps?: ThinkingStep[];
  toolCalls?: {
    name: string;
    args: Record<string, unknown>;
    summary: string;
    mutated: boolean;
  }[];
  followUpSuggestions?: string[];
  clarifyingQuestions?: ClarifyingQuestion[];
  attachments?: { name: string; size: number }[];
  cliOutput?: { deviceId: string; command: string; output: string };
  exportCards?: ChatExportCard[];
  hasTopologyUpdate?: boolean;
  topologySummary?: {
    devices: number;
    links: number;
    vlans: number;
    routing: string;
    score?: number;
    grade?: string;
  };
}

export interface ConversationWorkspaceState {
  projectName: string;
  topology: BuiltTopology;
  plan: NetworkPlan;
  acls: AclRule[];
}

export interface WorkspaceRevision {
  number: number;
  note: string;
  createdAt: string;
  snapshot: ConversationWorkspaceState;
}
export interface WorkspaceProposal {
  id: string;
  state: ConversationWorkspaceState;
  createdAt: string;
}
export type ConversationPatch = Partial<
  Pick<StoredConversation, "title" | "pinned" | "mode" | "workspaceState">
> & {
  expectedVersion?: number;
  note?: string;
  pendingProposal?: WorkspaceProposal | null;
};
export interface ConversationAppendOptions {
  title?: string;
  mode?: AgentWorkMode;
  workspaceState?: ConversationWorkspaceState;
  pendingProposal?: WorkspaceProposal;
  expectedVersion?: number;
  requestId?: string;
}

export interface StoredConversation {
  id: string;
  ownerId: string;
  title: string;
  pinned: boolean;
  mode: AgentWorkMode;
  messages: StoredChatMessage[];
  version?: number;
  workspaceRevisions?: WorkspaceRevision[];
  pendingProposal?: WorkspaceProposal;
  completedRequests?: string[];
  workspaceState?: ConversationWorkspaceState;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  pinned: boolean;
  mode: AgentWorkMode;
  messageCount: number;
  hasTopology: boolean;
  lastMessagePreview: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserPreferences {
  defaultMode: AgentWorkMode;
  defaultRouting: "OSPF" | "EIGRP" | "BGP" | "STATIC";
  autoVlan: boolean;
  autoApplyCanvas: boolean;
  showThinkingByDefault: boolean;
  accentTheme: AccentTheme;
}

export interface StoredProfile {
  ownerId: string;
  displayName: string;
  roleTitle: string;
  organization: string;
  bio: string;
  avatarColor: AccentTheme;
  customInstructions: string;
  memoryNotes: string[];
  preferences: UserPreferences;
  updatedAt: string;
}

export interface ProfileStats {
  conversationCount: number;
  pinnedConversationCount: number;
  totalMessages: number;
  projectCount: number;
  totalDevicesArchitected: number;
}

export interface BranchDesignSummary {
  id: string;
  name: string;
  head: number;
  updatedAt: string;
}

export interface BranchDesignDetail {
  design: BranchDesignSummary & {
    revisions: { number: number; createdAt: string }[];
  };
  revision: { number: number; plan: BranchPlan; createdAt: string };
}

export type AppendRevisionResult =
  | { outcome: "missing" }
  | { outcome: "stale"; head: number }
  | { outcome: "saved"; design: BranchDesignSummary };

export interface DataStore {
  readonly mode: "postgresql" | "local-json";

  // Users
  findUserByEmail(email: string): Promise<StoredUser | null>;
  findUserById(id: string): Promise<StoredUser | null>;
  createUser(input: {
    email: string;
    name: string;
    passwordHash: string;
  }): Promise<StoredUser>;
  adoptGuestRecords(guestOwnerId: string, userOwnerId: string): Promise<number>;

  // Studio Projects + Time-Machine Revisions
  listProjects(ownerId: string): Promise<StoredProject[]>;
  getProject(ownerId: string, id: string): Promise<StoredProject | null>;
  createProject(
    ownerId: string,
    input: Omit<
      StoredProject,
      "id" | "ownerId" | "revisions" | "createdAt" | "updatedAt"
    > & { note?: string },
  ): Promise<StoredProject>;
  updateProject(
    ownerId: string,
    id: string,
    patch: Partial<
      Pick<
        StoredProject,
        | "name"
        | "description"
        | "devices"
        | "connections"
        | "layout"
        | "network_plan"
        | "acls"
      >
    >,
    revisionNote?: string,
  ): Promise<StoredProject | null>;
  deleteProject(ownerId: string, id: string): Promise<boolean>;

  // AI Platform Conversations
  listConversations(
    ownerId: string,
    query?: string,
  ): Promise<ConversationSummary[]>;
  getConversation(
    ownerId: string,
    id: string,
  ): Promise<StoredConversation | null>;
  createConversation(
    ownerId: string,
    input?: {
      title?: string;
      mode?: AgentWorkMode;
      workspaceState?: ConversationWorkspaceState;
    },
  ): Promise<StoredConversation>;
  updateConversation(
    ownerId: string,
    id: string,
    patch: ConversationPatch,
  ): Promise<StoredConversation | null>;
  appendConversationMessages(
    ownerId: string,
    id: string,
    messages: StoredChatMessage[],
    options?: ConversationAppendOptions,
  ): Promise<StoredConversation | null>;
  restoreConversation(
    ownerId: string,
    id: string,
    revision: number,
    expectedVersion: number,
  ): Promise<StoredConversation | null>;
  reviewProposal(
    ownerId: string,
    id: string,
    proposalId: string,
    accept: boolean,
    expectedVersion: number,
  ): Promise<StoredConversation | null>;
  deleteConversation(ownerId: string, id: string): Promise<boolean>;

  // User Profile & Preferences
  getProfile(ownerId: string, fallbackName?: string): Promise<StoredProfile>;
  upsertProfile(
    ownerId: string,
    patch: Partial<
      Omit<StoredProfile, "ownerId" | "updatedAt" | "preferences">
    > & {
      preferences?: Partial<UserPreferences>;
    },
    fallbackName?: string,
  ): Promise<StoredProfile>;
  getProfileStats(ownerId: string): Promise<ProfileStats>;

  // Branch Designs (v1 versioned branch planner persistence)
  listBranchDesigns(ownerId: string): Promise<BranchDesignSummary[]>;
  createBranchDesign(
    ownerId: string,
    name: string,
    input: BranchRequest,
  ): Promise<BranchDesignSummary>;
  loadBranchDesign(
    ownerId: string,
    id: string,
    revisionNumber?: number,
  ): Promise<BranchDesignDetail | null>;
  appendBranchDesignRevision(
    ownerId: string,
    id: string,
    expectedHead: number,
    input: BranchRequest,
  ): Promise<AppendRevisionResult>;
}
