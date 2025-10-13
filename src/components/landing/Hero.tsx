"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/hooks/use-auth";
import { getHeroVariant } from "@/lib/flags";

export function Hero() {
  const { user } = useAuth();
  const heroVariant = getHeroVariant();
  return (
    <section className="relative min-h-[88vh] overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(1000px_600px_at_70%_-10%,hsl(var(--primary)/0.18),transparent_60%),radial-gradient(800px_400px_at_10%_20%,hsl(var(--ring)/0.12),transparent_60%)]" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-transparent via-background/40 to-background" />

      <div className="container mx-auto px-4 py-24 md:py-32">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          viewport={{ once: true }}
          className="text-center text-4xl md:text-6xl font-bold tracking-tight"
        >
          Revolutionize your workflow with AI.
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1, ease: "easeOut" }}
          viewport={{ once: true }}
          className="mt-6 text-center text-base md:text-lg text-muted-foreground max-w-2xl mx-auto"
        >
          One workspace that syncs your life, team, and tools — intelligently.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
          viewport={{ once: true }}
          className="mt-10 flex justify-center gap-4"
        >
          {user ? (
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-full px-6 py-3 text-sm md:text-base font-medium text-background bg-primary shadow-[0_0_32px_hsla(190,100%,50%,0.3)] hover:shadow-[0_0_42px_hsla(190,100%,50%,0.45)] transition"
            >
              Go to Dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/signup"
                className="inline-flex items-center justify-center rounded-full px-6 py-3 text-sm md:text-base font-medium text-background bg-primary shadow-[0_0_32px_hsla(190,100%,50%,0.3)] hover:shadow-[0_0_42px_hsla(190,100%,50%,0.45)] transition"
              >
                Get Early Access
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center rounded-full px-6 py-3 text-sm md:text-base font-medium border border-white/10 bg-background/30 backdrop-blur hover:bg-background/50 transition"
              >
                Watch Demo
              </Link>
            </>
          )}
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
          viewport={{ once: true }}
          className="mt-14"
        >
          <div className="relative mx-auto max-w-5xl rounded-2xl border border-white/10 bg-background/40 backdrop-blur p-3 shadow-[0_20px_80px_rgba(0,0,0,0.25)]">
            <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl ring-1 ring-white/10">
              {heroVariant === "future" ? (
                <Image
                  src="https://images.unsplash.com/photo-1518779578993-ec3579fee39f?q=80&w=2400&auto=format&fit=crop"
                  alt="Futuristic dashboard concept"
                  fill
                  sizes="(min-width: 1024px) 960px, 100vw"
                  className="object-cover"
                  priority
                />
              ) : (
                <Image
                  src="https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?q=80&w=2400&auto=format&fit=crop"
                  alt="Team collaborating on productivity workflows"
                  fill
                  sizes="(min-width: 1024px) 960px, 100vw"
                  className="object-cover"
                  priority
                />
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
