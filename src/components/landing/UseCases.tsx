"use client";

import { motion } from "framer-motion";
import Image from "next/image";

const cases = [
  {
    title: "Founder mornings",
    desc: "Start with a prioritized plan across hiring, product, and ops.",
    img: "/Untitled design.png",
  },
  {
    title: "Team standups",
    desc: "Auto-generate agendas and summaries from calendar + tasks.",
    img: "/dashboard.png",
  },
  {
    title: "Deep work blocks",
    desc: "Protect focus time while still tracking due dates and risks.",
    img: "/axon-logo.png",
  },
];

export function UseCases() {
  return (
    <section id="use-cases" className="py-20 md:py-28">
      <div className="container mx-auto px-4">
        <motion.h3
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-3xl md:text-4xl font-bold text-center"
        >
          Built for real days
        </motion.h3>
        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
          {cases.map((c, i) => (
            <motion.div
              key={c.title}
              initial={{ opacity: 0, y: 16, rotateX: -4 }}
              whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
              transition={{ duration: 0.5, delay: i * 0.06 }}
              viewport={{ once: true }}
              className="rounded-2xl border border-white/10 bg-background/40 backdrop-blur p-4"
            >
              <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl ring-1 ring-white/10">
                <Image
                  src={c.img}
                  alt={c.title}
                  fill
                  sizes="(min-width:768px) 360px, 100vw"
                  className="object-cover"
                />
              </div>
              <div className="mt-4 text-lg font-semibold">{c.title}</div>
              <p className="mt-1 text-sm text-muted-foreground">{c.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}





