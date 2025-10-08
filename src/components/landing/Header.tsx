"use client";

import Link from "next/link";
import { motion } from "framer-motion";

export function LandingHeader() {
  return (
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="sticky top-0 z-40 w-full border-b border-white/5 bg-background/50 backdrop-blur supports-[backdrop-filter]:bg-background/30"
    >
      <div className="container mx-auto h-16 flex items-center justify-between px-4">
        <Link href="/" className="font-bold tracking-tight text-xl">
          AxonAI
        </Link>
        <nav className="hidden md:flex items-center gap-6 text-sm text-foreground/80">
          <Link href="#features" className="hover:text-foreground transition">
            Features
          </Link>
          <Link href="#demo" className="hover:text-foreground transition">
            Demo
          </Link>
          <Link href="#pricing" className="hover:text-foreground transition">
            Pricing
          </Link>
          <Link
            href="#testimonials"
            className="hover:text-foreground transition"
          >
            Stories
          </Link>
        </nav>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-sm text-foreground/80 hover:text-foreground"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="rounded-full px-4 py-2 text-sm font-medium text-background bg-primary shadow-[0_0_24px_hsla(190,100%,50%,0.35)] hover:shadow-[0_0_34px_hsla(190,100%,50%,0.5)] transition"
          >
            Get Started
          </Link>
        </div>
      </div>
    </motion.header>
  );
}
