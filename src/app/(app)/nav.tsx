"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Icon } from "@/components/ui";

type Item = { href: string; label: string; icon: string; badge?: number; warn?: boolean };
export default function Nav({ groups }: { groups: { title: string; items: Item[] }[] }) {
  const p = usePathname();
  // Close the mobile drawer after navigating.
  useEffect(() => { const t = document.getElementById("navtoggle") as HTMLInputElement | null; if (t) t.checked = false; }, [p]);
  return (
    <nav aria-label="القائمة الرئيسية">
      {groups.map((g, gi) => (
        <div key={gi} style={{ display: "contents" }}>
          {g.title && <div className="group">{g.title}</div>}
          {g.items.map((i) => {
            const on = i.href === "/" ? p === "/" : p.startsWith(i.href);
            return (<Link key={i.href} href={i.href} className={on ? "on" : ""} aria-current={on ? "page" : undefined}>
              <Icon name={i.icon} />{i.label}{i.badge ? <span className={"nb" + (i.warn ? " warn" : "")}>{i.badge}</span> : null}
            </Link>);
          })}
        </div>
      ))}
    </nav>
  );
}
