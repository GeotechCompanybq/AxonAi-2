"use client";

import { motion } from "framer-motion";
import Image from "next/image";

const logos = [
  { src: "/axon-logo.png", alt: "AxonAI" },
  { src: "/favicon.png", alt: "App" },
  { src: "/dashboard.png", alt: "Dashboard" },
];

export function Integrations() {
  return (
    <section id="integrations" className="py-20 md:py-28">
      <div className="container mx-auto px-4">
        <motion.h3
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-3xl md:text-4xl font-bold text-center"
        >
          Works with your tools
        </motion.h3>
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          viewport={{ once: true }}
          className="mt-4 text-center text-muted-foreground max-w-2xl mx-auto"
        >
          Seamlessly sync tasks and time from your favorite platforms.
        </motion.p>
        <div className="mt-10 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-6 items-center">
          {logos.map((l, i) => (
            <motion.div
              key={l.alt}
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
              viewport={{ once: true }}
              className="flex items-center justify-center"
            >
              <div className="relative h-10 w-28 grayscale opacity-80 hover:opacity-100 hover:grayscale-0 transition">
                <Image
                  src={l.src}
                  alt={l.alt}
                  fill
                  sizes="112px"
                  className="object-contain"
                />
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}



