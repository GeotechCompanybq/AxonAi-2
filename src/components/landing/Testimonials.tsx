"use client";

import { motion } from "framer-motion";

const people = [
  {
    name: "Maya Patel",
    role: "Product Lead @ Flux",
    quote: "AxonAI replaced three tools and made our week actually manageable.",
  },
  {
    name: "Leo Kim",
    role: "Founder @ Shade",
    quote: "The schedule generation feels 10x smarter than anything we tried.",
  },
  {
    name: "Irene Gomez",
    role: "Ops @ Meridian",
    quote: "Our org dashboard finally shows what matters, not vanity metrics.",
  },
];

export function Testimonials() {
  return (
    <section id="testimonials" className="py-20 md:py-28">
      <div className="container mx-auto px-4">
        <motion.h3
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-3xl md:text-4xl font-bold text-center"
        >
          Teams love AxonAI
        </motion.h3>
        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
          {people.map((p, i) => (
            <motion.div
              key={p.name}
              initial={{ opacity: 0, y: 16, rotateX: -4 }}
              whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
              transition={{ duration: 0.5, delay: i * 0.05 }}
              viewport={{ once: true }}
              className="rounded-2xl border border-white/10 bg-background/40 backdrop-blur p-6"
            >
              <div className="text-sm text-muted-foreground">{p.role}</div>
              <div className="mt-2 font-semibold">{p.name}</div>
              <p className="mt-4 text-sm leading-relaxed">“{p.quote}”</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
