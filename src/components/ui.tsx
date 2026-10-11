import Link from "next/link";

// 24px line icons (stroke = currentColor). Kept small and few on purpose.
const P: Record<string, string> = {
  home: "M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
  spark: "M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z",
  users: "M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM21 19v-1a4 4 0 0 0-3-3.9M15.5 3.2a3.5 3.5 0 0 1 0 6.6",
  folder: "M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  doc: "M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v5h5M9 13h6M9 17h6",
  chat: "M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z",
  check: "M9 11l3 3 8-8M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9",
  pulse: "M3 12h4l3-8 4 16 3-8h4",
  flag: "M5 21V4m0 0h11l-2 4 2 4H5",
  wallet: "M3 7a2 2 0 0 1 2-2h13v4M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2zM16 14.5h.01",
  team: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  box: "M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  coins: "M9 14a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM15.5 10.1A6 6 0 1 1 9.9 15.5",
  key: "M15 7a4 4 0 1 1-3.9 4.9L3 20v-3h3v-2h2l1.1-1.1A4 4 0 0 1 15 7z",
  plus: "M12 5v14M5 12h14",
  bell: "M18 16v-5a6 6 0 1 0-12 0v5l-2 2h16zM10 20a2 2 0 0 0 4 0",
  menu: "M4 6h16M4 12h16M4 18h16",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 21a7 7 0 0 1 14 0",
  out: "M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l-5-5 5-5M5 12h11",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18",
};
export function Icon({ name, size = 18 }: { name: keyof typeof P | string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={P[name] || P.box} /></svg>;
}

type Action = { href: string; label: string; icon?: string; kind?: "primary" | "secondary" | "accent" };
/** Page header: title, one line of help, and the page's main actions on the left. */
export function PageHead({ title, help, crumbs, actions, badge }: { title: string; help?: React.ReactNode; crumbs?: { href: string; label: string }[]; actions?: Action[]; badge?: React.ReactNode }) {
  return (<div className="phead">
    <div className="ptext">
      {crumbs && <nav className="crumbs" aria-label="مسار الصفحة">{crumbs.map((c) => <Link key={c.href} href={c.href}>{c.label}</Link>)}</nav>}
      <h1>{title} {badge}</h1>
      {help && <p className="help">{help}</p>}
    </div>
    {actions && <div className="pactions">{actions.map((a) => <Link key={a.href} href={a.href} className={"btn " + (a.kind === "secondary" ? "secondary" : a.kind === "accent" ? "accent" : "")}>{a.icon && <Icon name={a.icon} size={16} />}{a.label}</Link>)}</div>}
  </div>);
}

/** Link-based tabs (server rendered, deep-linkable with ?tab=). */
export function Tabs({ base, current, tabs }: { base: string; current: string; tabs: { key: string; label: string; count?: number; alert?: boolean }[] }) {
  const sep = base.includes("?") ? "&" : "?";
  return (<div className="tabs" role="tablist">{tabs.map((t) => (
    <Link key={t.key} role="tab" aria-selected={current === t.key} href={`${base}${sep}tab=${t.key}`} className={current === t.key ? "on" : ""} scroll={false}>
      {t.label}{t.count ? <span className={"cnt" + (t.alert ? " alert" : "")}>{t.count}</span> : null}
    </Link>))}</div>);
}

/** Empty state that tells the person what to do next. */
export function Empty({ title, text, action }: { title: string; text?: string; action?: Action }) {
  return (<div className="empty"><b>{title}</b>{text && <p>{text}</p>}{action && <Link className="btn" href={action.href}>{action.icon && <Icon name={action.icon} size={16} />}{action.label}</Link>}</div>);
}
