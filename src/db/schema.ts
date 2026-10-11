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
  country: text("country"),
  source: text("source"),
  need: text("need"),
  stage: clientStage("stage").notNull().default("NEW"),
  nextStep: text("next_step"),
  nextDate: timestamp("next_date", { withTimezone: true }),
  createdAt: created(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const clientEvents = pgTable("client_events", {
  id: id(),
  clientId: text("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  stage: clientStage("stage"),
  note: text("note"),
  by: text("by_user"),
  createdAt: created(),
});
