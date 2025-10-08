"use client";

import { motion } from "framer-motion";
import { useState } from "react";

const plans = [
  {
    name: "Personal",
    monthly: "$9",
    yearly: "$84",
    bullets: ["AI schedules", "My Tasks", "Calendar"],
  },
  {
    name: "Team",
    monthly: "$19",
    yearly: "$192",
    bullets: ["Org Dashboard", "Integrations", "Analytics"],
  },
  {
    name: "Enterprise",
    monthly: "Custom",
    yearly: "Custom",
    bullets: ["SSO & SCIM", "Custom SLAs", "Dedicated support"],
  },
];

export function Pricing() {
  const [yearly, setYearly] = useState(true);
  return (
    <section id="pricing" className="py-20 md:py-28">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center"
        >
          <h3 className="text-3xl md:text-4xl font-bold">Pricing</h3>
          <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-background/40 backdrop-blur px-2 py-1">
            <span
              className={`text-sm px-3 py-1 rounded-full ${
                !yearly ? "bg-primary/20" : ""
              }`}
              onClick={() => setYearly(false)}
            >
              Monthly
            </span>
            <span
              className={`text-sm px-3 py-1 rounded-full ${
                yearly ? "bg-primary/20" : ""
              }`}
              onClick={() => setYearly(true)}
            >
              Yearly
            </span>
          </div>
        </motion.div>
        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((p, i) => (
            <motion.div
              key={p.name}
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.5, delay: i * 0.06 }}
              viewport={{ once: true }}
              className="rounded-2xl border border-white/10 bg-background/40 backdrop-blur p-6"
            >
              <div className="text-lg font-semibold">{p.name}</div>
              <div className="mt-2 text-3xl font-bold">
                {yearly ? p.yearly : p.monthly}
              </div>
              <ul className="mt-4 text-sm text-muted-foreground space-y-2">
                {p.bullets.map((b) => (
                  <li key={b}>• {b}</li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
