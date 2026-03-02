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
import { IntegrationSummary } from "@/components/overview/integration-summary";
import { OrgTaskSummary } from "@/components/org/org-task-summary";

export default async function OrgDashboardPage() {
  const features = [
    {
      title: "Create Org Schedule",
      description: "Let AI plan for the whole organization.",
      href: "/org/schedule/create",
      icon: <CalendarPlus className="h-10 w-10 text-primary mb-4" />,
      cta: "Plan for Org",
    },
    {
      title: "View Org Tasks",
      description: "See all tasks across teams in one view.",
      href: "/org/tasks",
      icon: <ListChecks className="h-10 w-10 text-primary mb-4" />,
      cta: "Open Tasks",
    },
    {
      title: "Org Calendar",
      description: "Calendar view of important org events.",
      href: "/org/calendar",
      icon: <CalendarDays className="h-10 w-10 text-primary mb-4" />,
      cta: "Open Calendar",
    },
    {
      title: "Org Analytics",
      description: "AI insights on workload and balance.",
      href: "/org/analytics",
      icon: <BarChart3 className="h-10 w-10 text-primary mb-4" />,
      cta: "View Analytics",
    },
  ];

  return (
    <div className="space-y-8">
      <Card className="shadow-lg border-primary/20">
        <CardHeader>
          <CardTitle className="text-3xl font-bold text-primary">
            Organization Dashboard
          </CardTitle>
          <CardDescription className="text-lg text-foreground/80">
            AI tools and overviews for your entire organization.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-foreground/90">
            Use AI to generate org-wide schedules, monitor tasks, and explore
            analytics across teams.
          </p>
        </CardContent>
      </Card>

      {/* @ts-expect-error IntegrationSummary is a client component */}
      <IntegrationSummary mode="org" />

      {/* Interactive org task summary: Open | Overdue | Due soon | Completed */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg">Task overview</CardTitle>
          <CardDescription>
            Org-wide open tasks, overdue, due soon, and completed. Click a card to filter in Org Tasks.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OrgTaskSummary />
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {features.map((feature) => (
          <Card
            key={feature.title}
            className="flex flex-col shadow-md hover:shadow-lg transition-shadow duration-300 rounded-xl overflow-hidden border-border/50"
          >
            <CardHeader className="flex-grow p-6 items-center text-center">
              {feature.icon}
              <CardTitle className="text-xl font-semibold">
                {feature.title}
              </CardTitle>
              <CardDescription className="mt-2 text-sm text-muted-foreground">
                {feature.description}
              </CardDescription>
            </CardHeader>
            <CardFooter className="p-6 bg-muted/30">
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
