import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import {
  ArrowRight,
  CalendarPlus,
  ListChecks,
  BarChart3,
  CalendarDays,
} from "lucide-react";

export default async function DashboardPage() {
  // Fetch a set of motivational quotes from the free API and select one
  let selectedQuote: string | null = null;
  try {
    const url = new URL("https://api.jsongpt.com/json");
    url.searchParams.set(
      "prompt",
      "Generate one short motivational quote for focus, productivity, and work-life balance."
    );
    url.searchParams.set("quote", "string");

    const res = await fetch(url.toString(), { cache: "no-store" });
    if (res.ok) {
      const data: any = await res.json();
      if (typeof data === "string") {
        selectedQuote = data;
      } else if (typeof data?.quote === "string") {
        selectedQuote = data.quote;
      } else if (typeof data?.text === "string") {
        selectedQuote = data.text;
      } else if (Array.isArray(data) && data.length > 0) {
        const candidate = data[0];
        selectedQuote =
          typeof candidate === "string"
            ? candidate
            : typeof candidate?.quote === "string"
            ? candidate.quote
            : null;
      }
    }
  } catch {}

  if (!selectedQuote) {
    const fallbackQuotes = [
      "Small steps each day lead to big results.",
      "Focus on progress, not perfection.",
      "Your future is built by what you do today.",
      "Stay consistent; success is a habit.",
      "You don’t need more time, just more focus.",
      "Done is better than perfect.",
      "Every task finished is momentum earned.",
    ];
    selectedQuote =
      fallbackQuotes[Math.floor(Math.random() * fallbackQuotes.length)];
  }

  const features = [
    {
      title: "Create Your Schedule",
      description: "Let AI craft your perfect day. Just tell us your goals.",
      href: "/schedule/create",
      icon: <CalendarPlus className="h-10 w-10 text-primary mb-4" />, // Increased icon size and added margin
      cta: "Start Planning",
    },
    {
      title: "Manage Your Tasks",
      description: "View, update, and track your daily to-dos effortlessly.",
      href: "/tasks",
      icon: <ListChecks className="h-10 w-10 text-primary mb-4" />,
      cta: "View Tasks",
    },
    {
      title: "View Your Calendar",
      description: "See your important dates visually on a calendar.",
      href: "/calendar",
      icon: <CalendarDays className="h-10 w-10 text-primary mb-4" />,
      cta: "Open Calendar",
    },
    {
      title: "See Your Progress",
      description:
        "Visualize your achievements and time usage with insightful analytics.",
      href: "/analytics",
      icon: <BarChart3 className="h-10 w-10 text-primary mb-4" />,
      cta: "View Analytics",
    },
  ];

  return (
    <div className="space-y-8">
      <Card className="shadow-lg border-primary/20">
        <CardHeader>
          <CardTitle className="text-3xl font-bold text-primary">
            Welcome to Axon!
          </CardTitle>
          <CardDescription className="text-lg text-foreground/80">
            Your day, your goals, no stress. Let AI handle the mess.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-foreground/90">
            Axon is your intelligent assistant for mastering your schedule.
            Create, adapt, and visualize your plans with the power of AI.
          </p>
          {selectedQuote ? (
            <div className="mt-4 rounded-md border bg-muted/30 p-4">
              <p className="italic text-sm text-muted-foreground">
                “{selectedQuote}”
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {" "}
        {/* Adjusted grid to 2 columns for better spacing */}
        {features.map((feature) => (
          <Card
            key={feature.title}
            className="flex flex-col shadow-md hover:shadow-lg transition-shadow duration-300 rounded-xl overflow-hidden border-border/50"
          >
            <CardHeader className="flex-grow p-6 items-center text-center">
              {" "}
              {/* Centered content */}
              {feature.icon}
              <CardTitle className="text-xl font-semibold">
                {feature.title}
              </CardTitle>
              <CardDescription className="mt-2 text-sm text-muted-foreground">
                {feature.description}
              </CardDescription>
            </CardHeader>
            <CardFooter className="p-6 bg-muted/30">
              {" "}
              {/* Moved button to CardFooter for distinct section */}
              <Button asChild className="w-full">
                <Link href={feature.href}>
                  {feature.cta} <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
