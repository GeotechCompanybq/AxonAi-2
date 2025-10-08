"use client";

import { motion } from "framer-motion";
import Image from "next/image";

export function Demo() {
  return (
    <section id="demo" className="py-20 md:py-28">
      <div className="container mx-auto px-4">
        <motion.h3
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-3xl md:text-4xl font-bold text-center"
        >
          A Glimpse of AxonAI
        </motion.h3>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          viewport={{ once: true }}
          className="mt-10 rounded-2xl border border-white/10 bg-background/40 backdrop-blur p-4 shadow-[0_20px_80px_rgba(0,0,0,0.25)]"
        >
          <div className="relative aspect-video w-full rounded-xl overflow-hidden ring-1 ring-white/10 bg-black/10">
            <Image
              src="/dashboard.png"
              alt="AxonAI Dashboard preview"
              fill
              sizes="(min-width: 768px) 960px, 100vw"
              className="object-contain object-left"
              priority
            />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
