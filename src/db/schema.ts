import { pgTable, pgEnum, text, integer, boolean, timestamp, numeric } from "drizzle-orm/pg-core";
import { randomUUID } from "crypto";

const id = () => text("id").primaryKey().$defaultFn(() => randomUUID());
const created = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const roleEnum = pgEnum("role", ["ADMIN", "TEAM_LEAD", "MEMBER"]);
export const supplierCategory = pgEnum("supplier_category", ["VPS", "API", "WHATSAPP", "OTHER"]);
export const billingEnum = pgEnum("billing", ["MONTHLY", "YEARLY", "PER_MESSAGE", "PER_USAGE", "ONE_TIME"]);

export const users = pgTable("users", {
  id: id(),
  name: text("name").notNull(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull().default("MEMBER"),
  jobTitle: text("job_title"),
  phone: text("phone"),
  active: boolean("active").notNull().default(true),
  failedLogins: integer("failed_logins").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  sessionVersion: integer("session_version").notNull().default(0),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: created(),
});

export const suppliers = pgTable("suppliers", {
  id: id(),
  category: supplierCategory("category").notNull(),
  provider: text("provider").notNull(),
  item: text("item").notNull(),
  price: numeric("price", { precision: 14, scale: 4, mode: "number" }).notNull(),
  currency: text("currency").notNull().default("EGP"),
  billing: billingEnum("billing").notNull().default("MONTHLY"),
  details: text("details"),
  createdAt: created(),
});

export const fixedCosts = pgTable("fixed_costs", {
  id: id(),
  name: text("name").notNull(),
  amountEgp: numeric("amount_egp", { precision: 14, scale: 2, mode: "number" }).notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: created(),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const auditLog = pgTable("audit_log", {
  id: id(),
  userId: text("user_id"),
  action: text("action").notNull(),
  details: text("details"),
  ip: text("ip"),
  createdAt: created(),
});

// ===== Phase 2: projects, roles, finance =====
export const projectStatus = pgEnum("project_status", ["MEETING", "BRIEF", "APPROVED", "IN_PROGRESS", "DELIVERED", "CLOSED", "CANCELLED"]);
export const projectSize = pgEnum("project_size", ["SMALL", "MEDIUM", "LARGE"]);
export const deductionType = pgEnum("deduction_type", ["REWORK", "NO_REPLY", "CLIENT_LOSS", "CLIENT_REFUSE", "OTHER"]);
export const decision = pgEnum("decision", ["PENDING", "APPROVED", "REJECTED"]);

export const projects = pgTable("projects", {
  id: id(),
  name: text("name").notNull(),
  client: text("client").notNull(),
  clientId: text("client_id"),
  currency: text("currency").notNull().default("EGP"),
  rate: numeric("rate", { precision: 12, scale: 4, mode: "number" }).notNull().default(1), // to EGP, frozen per project
  price: numeric("price", { precision: 14, scale: 2, mode: "number" }).notNull(),
  size: projectSize("size").notNull().default("MEDIUM"),
  status: projectStatus("status").notNull().default("MEETING"),
  fundPct: numeric("fund_pct", { precision: 5, scale: 2, mode: "number" }).notNull(),
  ownerPct: numeric("owner_pct", { precision: 5, scale: 2, mode: "number" }).notNull(),
  teamCapPct: numeric("team_cap_pct", { precision: 5, scale: 2, mode: "number" }).notNull(),
  // ONE_TIME: implementation fee, running services billed separately (e.g. Walid).
  // SUBSCRIPTION: fixed monthly fee that covers running costs; client pays Meta for messages beyond the free tier,
  // and any extra AI token usage is added to the subscription.
  billing: text("billing").notNull().default("ONE_TIME"),
  monthlyFee: numeric("monthly_fee", { precision: 12, scale: 2, mode: "number" }),
  freeMessages: integer("free_messages").default(1000),
  nextDueDate: timestamp("next_due_date", { withTimezone: true }), // next subscription payment, set by the owner
  reminderDays: integer("reminder_days").notNull().default(3),
  kinds: text("kinds"), // comma list: AUTOMATION,CHATBOT,WEBSITE,APP,SAAS,DASHBOARD
  startDate: timestamp("start_date", { withTimezone: true }),
  dueDate: timestamp("due_date", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  description: text("description"),
  createdAt: created(),
});

export const projectPayments = pgTable("project_payments", {
  id: id(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 14, scale: 2, mode: "number" }).notNull(), // in project currency
  paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
  note: text("note"),
});

export const projectCosts = pgTable("project_costs", {
  id: id(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  amountEgp: numeric("amount_egp", { precision: 14, scale: 2, mode: "number" }).notNull(),
  createdAt: created(),
});

export const projectRoles = pgTable("project_roles", {
  id: id(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  fee: numeric("fee", { precision: 12, scale: 2, mode: "number" }).notNull(), // EGP, for the whole role
  scope: text("scope"),
  deliverables: text("deliverables"),
  dueDate: timestamp("due_date", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  progress: integer("progress").notNull().default(0),
  createdAt: created(),
});

export const roleMembers = pgTable("role_members", {
  id: id(),
  roleId: text("role_id").notNull().references(() => projectRoles.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id),
  sharePct: numeric("share_pct", { precision: 5, scale: 2, mode: "number" }).notNull().default(100),
  isLead: boolean("is_lead").notNull().default(true),
});

export const deductions = pgTable("deductions", {
  id: id(),
  roleId: text("role_id").notNull().references(() => projectRoles.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id),
  type: deductionType("type").notNull(),
  pct: numeric("pct", { precision: 5, scale: 2, mode: "number" }).notNull(),
  banNext: boolean("ban_next").notNull().default(false),
  reason: text("reason").notNull(),
  evidence: text("evidence"),
  response: text("response"),
  status: decision("status").notNull().default("PENDING"),
  createdBy: text("created_by"),
  createdAt: created(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
});

export const bans = pgTable("bans", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id),
  reason: text("reason").notNull(),
  consumedByProject: text("consumed_by_project"), // the project the person was excluded from
  createdAt: created(),
});

export const payouts = pgTable("payouts", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id),
  projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
  amountEgp: numeric("amount_egp", { precision: 12, scale: 2, mode: "number" }).notNull(),
  paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
  note: text("note"),
});

export const fundSpends = pgTable("fund_spends", {
  id: id(),
  name: text("name").notNull(),
  amountEgp: numeric("amount_egp", { precision: 12, scale: 2, mode: "number" }).notNull(),
  spentAt: timestamp("spent_at", { withTimezone: true }).notNull().defaultNow(),
});

// ===== Files & credentials =====
export const fileKind = pgEnum("file_kind", ["DELIVERABLE", "FINAL"]);
export const projectFiles = pgTable("project_files", {
  id: id(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  roleId: text("role_id").references(() => projectRoles.id, { onDelete: "set null" }),
  kind: fileKind("kind").notNull(),
  uploadedBy: text("uploaded_by").notNull().references(() => users.id),
  originalName: text("original_name").notNull(),
  storedName: text("stored_name").notNull().unique(),
  size: integer("size").notNull(),
  mime: text("mime").notNull(),
  note: text("note"),
  createdAt: created(),
});

export const credentials = pgTable("credentials", {
  id: id(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  url: text("url"),
  username: text("username"),
  secretEnc: text("secret_enc"),
  notes: text("notes"),
  createdAt: created(),
});

// ===== Clients & deal stages =====
export const clientStage = pgEnum("client_stage", ["NEW", "MEETING_SET", "MEETING_DONE", "BRIEF_SENT", "NEGOTIATION", "AGREED", "ACTIVE", "DONE", "ON_HOLD", "LOST"]);
export const clients = pgTable("clients", {
  id: id(),
  name: text("name").notNull(),
  company: text("company"),
  phone: text("phone"),
  email: text("email"),
  website: text("website"),
  socials: text("socials"), // one link / handle per line
  notes: text("notes"),
  country: text("country"),
  source: text("source"),
  need: text("need"),
  stage: clientStage("stage").notNull().default("NEW"),
  customStage: text("custom_stage"),
  nextStep: text("next_step"),
  nextDate: timestamp("next_date", { withTimezone: true }),
  createdAt: created(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const clientEvents = pgTable("client_events", {
  id: id(),
  clientId: text("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  stage: clientStage("stage"),
  customStage: text("custom_stage"),
  note: text("note"),
  by: text("by_user"),
  createdAt: created(),
});

export const clientFiles = pgTable("client_files", {
  id: id(),
  clientId: text("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  kind: text("kind").notNull().default("BRIEF"), // BRIEF | CONTRACT | OTHER
  uploadedBy: text("uploaded_by").notNull().references(() => users.id),
  originalName: text("original_name").notNull(),
  storedName: text("stored_name").notNull().unique(),
  size: integer("size").notNull(),
  mime: text("mime").notNull(),
  note: text("note"),
  createdAt: created(),
});

// The payment agreement with a client. Ticking "paid" on an item linked to a project
// also records it as a project payment (and unticking removes that payment).
export const installments = pgTable("installments", {
  id: id(),
  clientId: text("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
  label: text("label").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2, mode: "number" }).notNull(),
  currency: text("currency").notNull().default("EGP"),
  dueNote: text("due_note"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  paymentId: text("payment_id"),
  sort: integer("sort").notNull().default(0),
  createdAt: created(),
});

// ===== Phase 3: tasks, updates, complaints =====
export const taskStatus = pgEnum("task_status", ["TODO", "DOING", "REVIEW", "DONE", "BLOCKED"]);
export const tasks = pgTable("tasks", {
  id: id(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  roleId: text("role_id").references(() => projectRoles.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  details: text("details"),
  assigneeId: text("assignee_id").references(() => users.id),
  status: taskStatus("status").notNull().default("TODO"),
  dueDate: timestamp("due_date", { withTimezone: true }),
  createdBy: text("created_by"),
  doneAt: timestamp("done_at", { withTimezone: true }),
  createdAt: created(),
});

// Daily progress notes (from the web or the assistant).
export const updates = pgTable("updates", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id),
  projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  source: text("source").notNull().default("WEB"),
  createdAt: created(),
});

export const complaintStatus = pgEnum("complaint_status", ["OPEN", "ANSWERED", "RESOLVED", "DISMISSED", "DEDUCTED"]);
export const complaints = pgTable("complaints", {
  id: id(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  reporterId: text("reporter_id").notNull().references(() => users.id), // visible to the admin only
  againstId: text("against_id").notNull().references(() => users.id),
  text: text("text").notNull(),
  evidence: text("evidence"),
  response: text("response"),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
  status: complaintStatus("status").notNull().default("OPEN"),
  decisionNote: text("decision_note"),
  deductionId: text("deduction_id"),
  createdAt: created(),
});

// ===== Phase 4: assistant =====
export const assistantMessages = pgTable("assistant_messages", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // user | assistant
  content: text("content").notNull(),
  createdAt: created(),
});

// ===== Phase 5: generated briefs (admin only: they contain prices) =====
export const projectBriefs = pgTable("project_briefs", {
  id: id(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  lang: text("lang").notNull(),
  version: integer("version").notNull().default(1),
  parentId: text("parent_id"),
  instruction: text("instruction"),
  contentJson: text("content_json"),
  optsJson: text("opts_json"),
  storedName: text("stored_name").notNull().unique(),
  size: integer("size").notNull(),
  createdBy: text("created_by"),
  createdAt: created(),
});

// ===== Project group chat (members of the project + admin) =====
export const projectMessages = pgTable("project_messages", {
  id: id(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id),
  text: text("text").notNull().default(""),
  fileName: text("file_name"),
  storedName: text("stored_name"),
  fileSize: integer("file_size"),
  mime: text("mime"),
  createdAt: created(),
});
export const chatReads = pgTable("chat_reads", {
  id: id(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  lastReadAt: timestamp("last_read_at", { withTimezone: true }).notNull().defaultNow(),
});

// General company expenses (ads, tools, one-off purchases) for the monthly cash view.
export const expenses = pgTable("expenses", {
  id: id(),
  name: text("name").notNull(),
  category: text("category").notNull().default("OTHER"), // ADS | TOOLS | SALARIES | OTHER
  amountEgp: numeric("amount_egp", { precision: 12, scale: 2, mode: "number" }).notNull(),
  spentAt: timestamp("spent_at", { withTimezone: true }).notNull().defaultNow(),
  note: text("note"),
});

// Websites, apps, SaaS, servers, domains… that belong to a project (non-secret details; logins live in credentials).
export const projectAssets = pgTable("project_assets", {
  id: id(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // WEBSITE | APP | SAAS | SERVER | DOMAIN | OTHER
  name: text("name").notNull(),
  url: text("url"),
  provider: text("provider"),
  details: text("details"),
  cost: numeric("cost", { precision: 12, scale: 2, mode: "number" }),
  currency: text("currency").notNull().default("EGP"),
  billing: text("billing").notNull().default("MONTHLY"), // MONTHLY | YEARLY | ONE_TIME
  paidBy: text("paid_by").notNull().default("CLIENT"), // CLIENT | US | INCLUDED
  renewsAt: timestamp("renews_at", { withTimezone: true }),
  inBrief: boolean("in_brief").notNull().default(true),
  createdAt: created(),
});

// Owner's ideas board: things to build in the system or change in the company.
export const ideas = pgTable("ideas", {
  id: id(),
  title: text("title").notNull(),
  details: text("details"),
  area: text("area").notNull().default("COMPANY"), // SYSTEM | COMPANY | CLIENTS | MARKETING | OTHER
  status: text("status").notNull().default("NEW"), // NEW | PLANNED | DOING | DONE | DROPPED
  priority: text("priority").notNull().default("MID"), // HIGH | MID | LOW
  createdBy: text("created_by"),
  createdAt: created(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
