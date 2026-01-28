"use client";

import { motion } from "framer-motion";

const integrations = [
  { 
    name: "Monday.com", 
    logo: "/Intergrations/monday.png",
    desc: "Project management & tasks"
  },
  { 
    name: "Jira", 
    logo: "/Intergrations/jira-software.png",
    desc: "Issue tracking & agile"
  },
  { 
    name: "Harvest", 
    logo: "/Intergrations/Harvest-New.png",
    desc: "Time tracking & invoicing"
  },
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
          Seamlessly sync tasks and time from Monday.com, Jira, and Harvest.
        </motion.p>
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {integrations.map((integration, i) => {
            return (
              <motion.div
                key={integration.name}
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                viewport={{ once: true }}
                className="flex flex-col items-center justify-center p-8 rounded-2xl border border-white/10 bg-background/40 backdrop-blur hover:border-white/20 transition-colors"
              >
                <img 
                  src={integration.logo} 
                  alt={integration.name}
                  className="h-16 w-auto object-contain"
                />
                <div className="mt-4 text-lg font-semibold">{integration.name}</div>
                <p className="mt-2 text-sm text-muted-foreground text-center">{integration.desc}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}










