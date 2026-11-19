import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import {
  copyFile,
  mkdir,
  open,
  readFile,
  rename,
  unlink,
} from "node:fs/promises";
import { HttpError } from "../middleware/error-handler";
import { dirname } from "node:path";
import { planBranch } from "@/lib/design/branch";
import type { BranchPlan, BranchRequest } from "@/lib/design/schema";
import type {
  AgentWorkMode,
  AppendRevisionResult,
  BranchDesignDetail,
  BranchDesignSummary,
  ConversationSummary,
  ConversationPatch,
  ConversationAppendOptions,
  WorkspaceRevision,
  ConversationWorkspaceState,
  DataStore,
  ProfileStats,
  StoredChatMessage,
  StoredConversation,
  StoredProfile,
  StoredProject,
  StoredUser,
  UserPreferences,
} from "./types";

interface StoredBranchDesign {
  id: string;
  ownerId: string;
  name: string;
  head: number;
  createdAt: string;
  updatedAt: string;
  revisions: { number: number; plan: BranchPlan; createdAt: string }[];
}

export interface StoreFileShape {
  users: StoredUser[];
  projects: StoredProject[];
  branchDesigns: StoredBranchDesign[];
  conversations: StoredConversation[];
  profiles: StoredProfile[];
}

function makeId(prefix: string): string {
  return `${prefix}${randomBytes(8).toString("hex")}`.toLowerCase();
}

export function defaultProfileFor(
  ownerId: string,
  fallbackName?: string,
): StoredProfile {
  return {
    ownerId,
    displayName:
      fallbackName?.trim() ||
      (ownerId.startsWith("guest:") ? "Network Engineer" : "NetTopo Engineer"),
    roleTitle: "Network Architect",
    organization: "",
    bio: "",
    avatarColor: "blue",
    customInstructions: "",
    memoryNotes: [],
    preferences: {
      defaultMode: "auto",
      defaultRouting: "OSPF",
      autoVlan: true,
      autoApplyCanvas: true,
      showThinkingByDefault: false,
      accentTheme: "blue",
    },
    updatedAt: new Date().toISOString(),
  };
}

export class LocalJsonStore implements DataStore {
  readonly mode = "local-json" as const;
  private data: StoreFileShape;

  constructor(
    private readonly filePath?: string,
    initial?: StoreFileShape,
  ) {
    this.data = initial ? structuredClone(initial) : this.readFromDisk();
    // Every operation reloads under an inter-process lock; results cannot mutate stored state.
    return new Proxy(this, {
      get(target, key, receiver) {
        const value = Reflect.get(target, key, receiver);
        if (
          typeof key === "string" &&
          /^(find|create|adopt|list|load|get|update|append|delete|upsert|restore|review)/.test(
            key,
          ) &&
          typeof value === "function"
        ) {
          return (...args: unknown[]) =>
            target.transaction(() => value.apply(target, args));
        }
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  }

  exportSnapshot(): StoreFileShape {
    return structuredClone(this.data);
  }

  private decode(raw: string): StoreFileShape {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error("Invalid store format.");
    for (const key of [
      "users",
      "projects",
      "branchDesigns",
      "conversations",
      "profiles",
    ]) {
      if (parsed[key] !== undefined && !Array.isArray(parsed[key]))
        throw new Error(`Invalid store collection: ${key}`);
    }
    const data: StoreFileShape = {
      users: [],
      projects: [],
      branchDesigns: [],
      conversations: [],
      profiles: [],
      ...parsed,
    };
    for (const conversation of data.conversations) {
      conversation.version ??= 1;
      conversation.workspaceRevisions ??= conversation.workspaceState
        ? [
            {
              number: 1,
              note: "Imported baseline",
              createdAt: conversation.updatedAt,
              snapshot: structuredClone(conversation.workspaceState),
            },
          ]
        : [];
    }
    return data;
  }

  private readFromDisk(): StoreFileShape {
    if (!this.filePath || !existsSync(this.filePath))
      return {
        users: [],
        projects: [],
        branchDesigns: [],
        conversations: [],
        profiles: [],
      };
    try {
      return this.decode(readFileSync(this.filePath, "utf8"));
    } catch (error) {
      throw new Error(
        "Cannot read data store. The original file was preserved; restore its .bak backup before restarting.",
        { cause: error },
      );
    }
  }

  private async transaction<T>(work: () => Promise<T>): Promise<T> {
    if (!this.filePath) return structuredClone(await work());
    await mkdir(dirname(this.filePath), { recursive: true });
    const lockPath = `${this.filePath}.lock`;
    const deadline = Date.now() + 10_000;
    let lock;
    while (!lock) {
      try {
        lock = await open(lockPath, "wx", 0o600);
        await lock.writeFile(String(process.pid));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        try {
          const pid = Number(await readFile(lockPath, "utf8"));
          if (pid > 0) {
            try {
              process.kill(pid, 0);
            } catch (probe) {
              if ((probe as NodeJS.ErrnoException).code === "ESRCH")
                await unlink(lockPath);
            }
          }
        } catch {
          /* another operation released the lock */
        }
        if (Date.now() >= deadline)
          throw new HttpError(
            503,
            "STORE_BUSY",
            "Storage is busy. Retry your change.",
          );
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }
    try {
      try {
        this.data = this.decode(await readFile(this.filePath, "utf8"));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      const before = structuredClone(this.data);
      try {
        return structuredClone(await work());
      } catch (error) {
        this.data = before;
        throw error;
      }
    } finally {
      await lock.close();
      await unlink(lockPath);
    }
  }

  private async persist() {
    if (!this.filePath) return;
    const tmp = `${this.filePath}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
    try {
      const handle = await open(tmp, "wx", 0o600);
      try {
        await handle.writeFile(JSON.stringify(this.data));
        await handle.sync();
      } finally {
        await handle.close();
      }
      try {
        await copyFile(this.filePath, `${this.filePath}.bak`);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      await rename(tmp, this.filePath);
    } finally {
      await unlink(tmp).catch(() => {});
    }
  }

  async findUserByEmail(email: string): Promise<StoredUser | null> {
    const norm = email.trim().toLowerCase();
    return this.data.users.find((u) => u.email.toLowerCase() === norm) ?? null;
  }

  async findUserById(id: string): Promise<StoredUser | null> {
    return this.data.users.find((u) => u.id === id) ?? null;
  }

  async createUser(input: {
    email: string;
    name: string;
    passwordHash: string;
  }): Promise<StoredUser> {
    if (
      this.data.users.some(
        (u) => u.email.toLowerCase() === input.email.trim().toLowerCase(),
      )
    )
      throw new HttpError(
        409,
        "EMAIL_EXISTS",
        "An account with this email already exists.",
      );
    const user: StoredUser = {
      id: makeId("usr"),
      email: input.email.trim().toLowerCase(),
      name: input.name.trim(),
      passwordHash: input.passwordHash,
      createdAt: new Date().toISOString(),
    };
    this.data.users.push(user);
    await this.persist();
    return user;
  }

  async adoptGuestRecords(
    guestOwnerId: string,
    userOwnerId: string,
  ): Promise<number> {
    let moved = 0;
    for (const p of this.data.projects) {
      if (p.ownerId === guestOwnerId) {
        p.ownerId = userOwnerId;
        moved++;
      }
    }
    for (const d of this.data.branchDesigns) {
      if (d.ownerId === guestOwnerId) {
        d.ownerId = userOwnerId;
        moved++;
      }
    }
    for (const c of this.data.conversations) {
      if (c.ownerId === guestOwnerId) {
        c.ownerId = userOwnerId;
        moved++;
      }
    }
    const guestProfileIdx = this.data.profiles.findIndex(
      (pr) => pr.ownerId === guestOwnerId,
    );
    const hasUserProfile = this.data.profiles.some(
      (pr) => pr.ownerId === userOwnerId,
    );
    if (guestProfileIdx !== -1) {
      if (!hasUserProfile) {
        this.data.profiles[guestProfileIdx].ownerId = userOwnerId;
        moved++;
      } else {
        this.data.profiles.splice(guestProfileIdx, 1);
        moved++;
      }
    }
    if (moved > 0) await this.persist();
    return moved;
  }

  async listProjects(ownerId: string): Promise<StoredProject[]> {
    return this.data.projects
      .filter((p) => p.ownerId === ownerId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getProject(ownerId: string, id: string): Promise<StoredProject | null> {
    return (
      this.data.projects.find((p) => p.ownerId === ownerId && p.id === id) ??
      null
    );
  }

  async createProject(
    ownerId: string,
    input: Omit<
      StoredProject,
      "id" | "ownerId" | "revisions" | "createdAt" | "updatedAt"
    > & { note?: string },
  ): Promise<StoredProject> {
    const now = new Date().toISOString();
    const project: StoredProject = {
      id: makeId("prj"),
      ownerId,
      name: input.name,
      description: input.description,
      source: input.source,
      prompt: input.prompt,
      devices: input.devices,
      connections: input.connections,
      layout: input.layout,
      network_plan: input.network_plan,
      acls: input.acls ?? [],
      revisions: [
        {
          number: 1,
          createdAt: now,
          note: input.note || "Initial design",
          snapshot: {
            devices: input.devices,
            connections: input.connections,
            layout: input.layout,
            network_plan: input.network_plan,
            acls: input.acls ?? [],
          },
        },
      ],
      createdAt: now,
      updatedAt: now,
    };
    this.data.projects.unshift(project);
    await this.persist();
    return project;
  }

  async updateProject(
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
  ): Promise<StoredProject | null> {
    const project = this.data.projects.find(
      (p) => p.ownerId === ownerId && p.id === id,
    );
    if (!project) return null;
    const now = new Date().toISOString();
    if (patch.name !== undefined) project.name = patch.name;
    if (patch.description !== undefined)
      project.description = patch.description;
    if (patch.devices !== undefined) project.devices = patch.devices;
    if (patch.connections !== undefined)
      project.connections = patch.connections;
    if (patch.layout !== undefined) project.layout = patch.layout;
    if (patch.network_plan !== undefined)
      project.network_plan = patch.network_plan;
    if (patch.acls !== undefined) project.acls = patch.acls;
    project.updatedAt = now;

    if (
      revisionNote ||
      patch.devices ||
      patch.connections ||
      patch.network_plan ||
      patch.acls
    ) {
      const nextNum = (project.revisions[0]?.number ?? 0) + 1;
      project.revisions.unshift({
        number: nextNum,
        createdAt: now,
        note: revisionNote || `Revision ${nextNum}`,
        snapshot: {
          devices: project.devices,
          connections: project.connections,
          layout: project.layout,
          network_plan: project.network_plan,
          acls: project.acls,
        },
      });
    }

    await this.persist();
    return project;
  }

  async deleteProject(ownerId: string, id: string): Promise<boolean> {
    const idx = this.data.projects.findIndex(
      (p) => p.ownerId === ownerId && p.id === id,
    );
    if (idx === -1) return false;
    this.data.projects.splice(idx, 1);
    await this.persist();
    return true;
  }

  // ---------------- CONVERSATIONS ----------------
  async listConversations(
    ownerId: string,
    query?: string,
  ): Promise<ConversationSummary[]> {
    const q = query?.trim().toLowerCase() ?? "";
    return this.data.conversations
      .filter((c) => c.ownerId === ownerId)
      .filter((c) => {
        if (!q) return true;
        if (c.title.toLowerCase().includes(q)) return true;
        return c.messages.some((m) => m.content.toLowerCase().includes(q));
      })
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.updatedAt.localeCompare(a.updatedAt);
      })

      .map((c) => {
        const last = c.messages[c.messages.length - 1];
        return {
          id: c.id,
          title: c.title,
          pinned: c.pinned,
          mode: c.mode,
          messageCount: c.messages.length,
          hasTopology: Boolean(c.workspaceState?.topology?.devices?.length),
          lastMessagePreview: last
            ? last.content.replace(/\s+/g, " ").slice(0, 90)
            : "",
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        };
      });
  }

  async getConversation(
    ownerId: string,
    id: string,
  ): Promise<StoredConversation | null> {
    return (
      this.data.conversations.find(
        (c) => c.ownerId === ownerId && c.id === id,
      ) ?? null
    );
  }

  async createConversation(
    ownerId: string,
    input?: {
      title?: string;
      mode?: AgentWorkMode;
      workspaceState?: ConversationWorkspaceState;
    },
  ): Promise<StoredConversation> {
    const now = new Date().toISOString();
    const conv: StoredConversation = {
      id: makeId("cht"),
      ownerId,
      title: input?.title?.trim() || "محادثة جديدة",
      pinned: false,
      mode: input?.mode ?? "auto",
      messages: [],
      workspaceState: input?.workspaceState,
      version: 1,
      workspaceRevisions: input?.workspaceState
        ? [
            {
              number: 1,
              note: "Initial design",
              createdAt: now,
              snapshot: structuredClone(input.workspaceState),
            },
          ]
        : [],
      createdAt: now,
      updatedAt: now,
    };
    this.data.conversations.unshift(conv);
    await this.persist();
    return conv;
  }

  async updateConversation(
    ownerId: string,
    id: string,
    patch: ConversationPatch,
  ): Promise<StoredConversation | null> {
    const conv = this.data.conversations.find(
      (c) => c.ownerId === ownerId && c.id === id,
    );
    if (!conv) return null;
    if (
      patch.expectedVersion !== undefined &&
      (conv.version ?? 1) !== patch.expectedVersion
    )
      throw new HttpError(
        409,
        "STALE_VERSION",
        "This design changed in another tab. Reload before applying changes.",
      );
    if (patch.title !== undefined)
      conv.title = patch.title.trim() || conv.title;
    if (patch.pinned !== undefined) conv.pinned = patch.pinned;
    if (patch.mode !== undefined) conv.mode = patch.mode;
    if (patch.workspaceState !== undefined && conv.pendingProposal)
      throw new HttpError(
        409,
        "REVIEW_REQUIRED",
        "Review the pending proposal before editing the saved design.",
      );
    if (patch.workspaceState !== undefined)
      this.recordWorkspace(
        conv,
        patch.workspaceState,
        patch.note ?? "Manual edit",
      );
    if (patch.pendingProposal !== undefined)
      conv.pendingProposal = patch.pendingProposal ?? undefined;
    conv.version = (conv.version ?? 1) + 1;
    conv.updatedAt = new Date().toISOString();
    await this.persist();
    return conv;
  }

  async appendConversationMessages(
    ownerId: string,
    id: string,
    messages: StoredChatMessage[],
    options?: ConversationAppendOptions,
  ): Promise<StoredConversation | null> {
    const conv = this.data.conversations.find(
      (c) => c.ownerId === ownerId && c.id === id,
    );
    if (!conv) return null;
    if (
      options?.requestId &&
      conv.completedRequests?.includes(options.requestId)
    )
      return conv;
    if (
      options?.expectedVersion !== undefined &&
      (conv.version ?? 1) !== options.expectedVersion
    )
      throw new HttpError(
        409,
        "STALE_VERSION",
        "Conversation changed while generating. Retry your message.",
      );
    conv.messages.push(...messages);
    if (options?.requestId)
      conv.completedRequests = [
        ...(conv.completedRequests ?? []),
        options.requestId,
      ];
    if (options?.pendingProposal)
      conv.pendingProposal = options.pendingProposal;
    conv.version = (conv.version ?? 1) + 1;
    if (options?.title) conv.title = options.title;
    if (options?.mode) conv.mode = options.mode;
    if (
      options?.workspaceState &&
      JSON.stringify(conv.workspaceState) !==
        JSON.stringify(options.workspaceState)
    )
      this.recordWorkspace(conv, options.workspaceState, "AI design");
    conv.updatedAt = new Date().toISOString();
    await this.persist();
    return conv;
  }

  async deleteConversation(ownerId: string, id: string): Promise<boolean> {
    const idx = this.data.conversations.findIndex(
      (c) => c.ownerId === ownerId && c.id === id,
    );
    if (idx === -1) return false;
    this.data.conversations.splice(idx, 1);
    await this.persist();
    return true;
  }

  private recordWorkspace(
    conv: StoredConversation,
    state: ConversationWorkspaceState,
    note: string,
  ) {
    conv.workspaceState = structuredClone(state);
    const revisions = conv.workspaceRevisions ?? [];
    const revision: WorkspaceRevision = {
      number: (revisions[0]?.number ?? 0) + 1,
      note,
      createdAt: new Date().toISOString(),
      snapshot: structuredClone(state),
    };
    conv.workspaceRevisions = [revision, ...revisions];
  }

  async restoreConversation(
    ownerId: string,
    id: string,
    revision: number,
    expectedVersion: number,
  ) {
    const conv = this.data.conversations.find(
      (c) => c.ownerId === ownerId && c.id === id,
    );
    if (!conv) return null;
    if ((conv.version ?? 1) !== expectedVersion)
      throw new HttpError(
        409,
        "STALE_VERSION",
        "Reload the latest design before restoring.",
      );
    const entry = conv.workspaceRevisions?.find((r) => r.number === revision);
    if (!entry) throw new HttpError(404, "NOT_FOUND", "Revision not found.");
    this.recordWorkspace(conv, entry.snapshot, `Restored revision ${revision}`);
    conv.pendingProposal = undefined;
    conv.version = (conv.version ?? 1) + 1;
    conv.updatedAt = new Date().toISOString();
    await this.persist();
    return conv;
  }

  async reviewProposal(
    ownerId: string,
    id: string,
    proposalId: string,
    accept: boolean,
    expectedVersion: number,
  ) {
    const conv = this.data.conversations.find(
      (c) => c.ownerId === ownerId && c.id === id,
    );
    if (!conv) return null;
    if ((conv.version ?? 1) !== expectedVersion)
      throw new HttpError(
        409,
        "STALE_VERSION",
        "Reload the latest design before reviewing.",
      );
    if (!conv.pendingProposal || conv.pendingProposal.id !== proposalId)
      throw new HttpError(
        409,
        "STALE_PROPOSAL",
        "This proposal is no longer available.",
      );
    if (accept)
      this.recordWorkspace(
        conv,
        conv.pendingProposal.state,
        "Accepted AI proposal",
      );
    conv.pendingProposal = undefined;
    conv.version = (conv.version ?? 1) + 1;
    conv.updatedAt = new Date().toISOString();
    await this.persist();
    return conv;
  }

  // ---------------- PROFILE & PREFERENCES ----------------
  async getProfile(
    ownerId: string,
    fallbackName?: string,
  ): Promise<StoredProfile> {
    const existing = this.data.profiles.find((p) => p.ownerId === ownerId);
    if (existing) return existing;
    return defaultProfileFor(ownerId, fallbackName);
  }

  async upsertProfile(
    ownerId: string,
    patch: Partial<
      Omit<StoredProfile, "ownerId" | "updatedAt" | "preferences">
    > & {
      preferences?: Partial<UserPreferences>;
    },
    fallbackName?: string,
  ): Promise<StoredProfile> {
    const idx = this.data.profiles.findIndex((p) => p.ownerId === ownerId);
    const current =
      idx !== -1
        ? this.data.profiles[idx]
        : defaultProfileFor(ownerId, fallbackName);
    const updated: StoredProfile = {
      ...current,
      displayName:
        patch.displayName !== undefined
          ? patch.displayName.trim() || current.displayName
          : current.displayName,
      roleTitle:
        patch.roleTitle !== undefined
          ? patch.roleTitle.trim()
          : current.roleTitle,
      organization:
        patch.organization !== undefined
          ? patch.organization.trim()
          : current.organization,
      bio: patch.bio !== undefined ? patch.bio.trim() : current.bio,
      avatarColor: patch.avatarColor ?? current.avatarColor,
      customInstructions:
        patch.customInstructions !== undefined
          ? patch.customInstructions.trim()
          : current.customInstructions,
      memoryNotes:
        patch.memoryNotes !== undefined
          ? patch.memoryNotes.filter(Boolean).slice(0, 12)
          : current.memoryNotes,
      preferences: {
        ...current.preferences,
        ...(patch.preferences ?? {}),
      },
      updatedAt: new Date().toISOString(),
    };
    if (idx !== -1) {
      this.data.profiles[idx] = updated;
    } else {
      this.data.profiles.push(updated);
    }
    await this.persist();
    return updated;
  }

  async getProfileStats(ownerId: string): Promise<ProfileStats> {
    const convs = this.data.conversations.filter((c) => c.ownerId === ownerId);
    const projs = this.data.projects.filter((p) => p.ownerId === ownerId);
    const totalMessages = convs.reduce((sum, c) => sum + c.messages.length, 0);
    const devicesFromProjs = projs.reduce(
      (sum, p) => sum + p.devices.length,
      0,
    );
    const devicesFromConvs = convs.reduce(
      (sum, c) => sum + (c.workspaceState?.topology?.devices?.length ?? 0),
      0,
    );
    return {
      conversationCount: convs.length,
      pinnedConversationCount: convs.filter((c) => c.pinned).length,
      totalMessages,
      projectCount: projs.length,
      totalDevicesArchitected: devicesFromProjs + devicesFromConvs,
    };
  }

  // ---------------- BRANCH DESIGNS ----------------
  async listBranchDesigns(ownerId: string): Promise<BranchDesignSummary[]> {
    return this.data.branchDesigns
      .filter((d) => d.ownerId === ownerId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

      .map(({ id, name, head, updatedAt }) => ({ id, name, head, updatedAt }));
  }

  async createBranchDesign(
    ownerId: string,
    name: string,
    input: BranchRequest,
  ): Promise<BranchDesignSummary> {
    const plan = planBranch(input);
    const now = new Date().toISOString();
    const record: StoredBranchDesign = {
      id: makeId("dsn"),
      ownerId,
      name,
      head: 1,
      createdAt: now,
      updatedAt: now,
      revisions: [{ number: 1, plan, createdAt: now }],
    };
    this.data.branchDesigns.unshift(record);
    await this.persist();
    return {
      id: record.id,
      name: record.name,
      head: record.head,
      updatedAt: record.updatedAt,
    };
  }

  async loadBranchDesign(
    ownerId: string,
    id: string,
    revisionNumber?: number,
  ): Promise<BranchDesignDetail | null> {
    const design = this.data.branchDesigns.find(
      (d) => d.ownerId === ownerId && d.id === id,
    );
    if (!design) return null;
    const targetNum = revisionNumber ?? design.head;
    const revision = design.revisions.find((r) => r.number === targetNum);
    if (!revision) return null;
    return {
      design: {
        id: design.id,
        name: design.name,
        head: design.head,
        updatedAt: design.updatedAt,
        revisions: [...design.revisions]
          .sort((a, b) => b.number - a.number)
          .map(({ number, createdAt }) => ({ number, createdAt })),
      },
      revision,
    };
  }

  async appendBranchDesignRevision(
    ownerId: string,
    id: string,
    expectedHead: number,
    input: BranchRequest,
  ): Promise<AppendRevisionResult> {
    const design = this.data.branchDesigns.find(
      (d) => d.ownerId === ownerId && d.id === id,
    );
    if (!design) return { outcome: "missing" };
    if (design.head !== expectedHead)
      return { outcome: "stale", head: design.head };
    const plan = planBranch(input);
    const now = new Date().toISOString();
    const next = expectedHead + 1;
    design.head = next;
    design.updatedAt = now;
    design.revisions.unshift({ number: next, plan, createdAt: now });
    await this.persist();
    return {
      outcome: "saved",
      design: {
        id: design.id,
        name: design.name,
        head: design.head,
        updatedAt: design.updatedAt,
      },
    };
  }
}
