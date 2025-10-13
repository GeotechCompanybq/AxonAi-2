"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";

export function FinalCta() {
  const { user } = useAuth();
  return (
    <section className="relative py-24 md:py-32 overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(600px_400px_at_50%_0%,hsl(var(--primary)/0.25),transparent_60%)]" />
      <div className="container mx-auto px-4 text-center">
        <motion.h3
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-3xl md:text-4xl font-bold"
        >
          Start working smarter with AxonAI
        </motion.h3>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          viewport={{ once: true }}
          className="mt-8"
        >
          {user ? (
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-full px-8 py-3 text-sm md:text-base font-medium text-background bg-primary shadow-[0_0_32px_hsla(190,100%,50%,0.35)] hover:shadow-[0_0_42px_hsla(190,100%,50%,0.5)] transition"
            >
              Go to Dashboard
            </Link>
          ) : (
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-full px-8 py-3 text-sm md:text-base font-medium text-background bg-primary shadow-[0_0_32px_hsla(190,100%,50%,0.35)] hover:shadow-[0_0_42px_hsla(190,100%,50%,0.5)] transition"
            >
              Get Started
            </Link>
          )}
        </motion.div>
      </div>
    </section>
  );
}
