"use client";

import { motion } from "framer-motion";
import Link from "next/link";

export function LandingFooter() {
  return (
    <motion.footer
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
      viewport={{ once: true }}
      className="border-t border-white/5 py-10"
    >
      <div className="container mx-auto px-4 text-center space-y-4">
        <div className="text-lg font-semibold">AxonAI</div>
        <div className="flex items-center justify-center gap-6 text-sm text-foreground/80">
          <Link href="#">About</Link>
          <Link href="#">Careers</Link>
          <Link href="#">Privacy</Link>
          <Link href="#">Contact</Link>
        </div>
        <div className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} AxonAI. All rights reserved.
        </div>
      </div>
    </motion.footer>
  );
}
