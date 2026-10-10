/** Soft two-colour tint behind the first section of a page; fades in below the solid header. */
export function HeroGlow() {
  return (
    <div
      className="pointer-events-none absolute top-0 left-1/2 -z-10 h-[36rem] w-screen -translate-x-1/2"
      style={{
        background:
          "radial-gradient(50% 70% at 15% 0%, color-mix(in oklab, var(--color-primary) 16%, transparent), transparent), radial-gradient(45% 65% at 85% 0%, color-mix(in oklab, var(--color-secondary) 20%, transparent), transparent)",
        maskImage: "linear-gradient(to bottom, transparent, black 25%, black 55%, transparent)",
      }}
      aria-hidden
    />
  );
}
