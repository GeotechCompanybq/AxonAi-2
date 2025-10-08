"use client";

import { motion } from "framer-motion";

const features = [
  {
    title: "AI Schedules",
    desc: "Generate your day plan with intelligent task prioritization.",
  },
  {
    title: "Org Dashboard",
    desc: "Team-wide analytics, tasks, and member management.",
  },
  {
    title: "Integrations",
    desc: "Sync Monday, Jira, and Harvest seamlessly.",
  },
  {
    title: "Calm UI",
    desc: "A focused, minimal interface with thoughtful motion.",
  },
];

export function Features() {
  return (
    <section className="relative py-20 md:py-28">
      <div className="container mx-auto px-4">
        <motion.h2
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          viewport={{ once: true }}
          className="text-3xl md:text-4xl font-bold text-center"
        >
          Everything in one intelligent workspace
        </motion.h2>
        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20, rotateX: -6 }}
              whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
              transition={{ duration: 0.55, delay: i * 0.06 }}
              viewport={{ once: true }}
              className="rounded-2xl border border-white/10 bg-background/40 backdrop-blur p-6 shadow-[0_10px_50px_rgba(0,0,0,0.25),0_0_0_1px_hsl(var(--ring)/0.15)_inset]"
            >
              <div className="text-xl font-semibold">{f.title}</div>
              <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
