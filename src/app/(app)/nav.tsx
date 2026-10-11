"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
type Item = { href: string; label: string };
export default function Nav({ groups }: { groups: { title: string; items: Item[] }[] }) {
  const p = usePathname();
  return (
    <nav aria-label="القائمة الرئيسية">
      {groups.map((g) => (
        <div key={g.title} style={{ display: "contents" }}>
          <div className="group">{g.title}</div>
          {g.items.map((i) => (
            <Link key={i.href} href={i.href} className={(i.href === "/" ? p === "/" : p.startsWith(i.href)) ? "on" : ""}>{i.label}</Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
