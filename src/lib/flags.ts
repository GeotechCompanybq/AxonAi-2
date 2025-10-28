export type HeroVariant = "classic" | "future";

export function getHeroVariant(): HeroVariant {
  const v = (process.env.NEXT_PUBLIC_HERO_VARIANT || "future").toLowerCase();
  return v === "future" ? "future" : "classic";
}

export function isA11yHighContrastDefault(): boolean {
  return (process.env.NEXT_PUBLIC_HIGH_CONTRAST_DEFAULT || "future").trim() === "1";
}



