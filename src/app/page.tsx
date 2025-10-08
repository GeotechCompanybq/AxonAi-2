"use client";

import { LandingHeader } from "@/components/landing/Header";
import { Hero } from "@/components/landing/Hero";
import { Features } from "@/components/landing/Features";
import { Demo } from "@/components/landing/Demo";
import { Testimonials } from "@/components/landing/Testimonials";
import { Pricing } from "@/components/landing/Pricing";
import { FinalCta } from "@/components/landing/FinalCta";
import { LandingFooter } from "@/components/landing/Footer";

export default function HomePage() {
  return (
    <main className="ai-grid-bg">
      <LandingHeader />
      <Hero />
      <Features />
      <Demo />
      <Testimonials />
      <Pricing />
      <FinalCta />
      <LandingFooter />
    </main>
  );
}
