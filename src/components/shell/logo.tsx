export function LogoMark({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" className={className} aria-hidden>
      <rect width="28" height="28" rx="8" fill="rgb(var(--primary))" />
      <rect x="7" y="7" width="6" height="14" rx="3" fill="rgb(var(--finance))" style={{ filter: "brightness(1.35)" }} />
      <rect x="15" y="7" width="6" height="6" rx="3" fill="rgb(var(--nutrition))" style={{ filter: "brightness(1.2)" }} />
      <rect x="15" y="15" width="6" height="6" rx="3" fill="rgb(var(--activities))" style={{ filter: "brightness(1.35)" }} />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className="text-md font-semibold tracking-tight">Life OS</span>
    </span>
  );
}
