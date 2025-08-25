import { ProgressPieChart } from "@/components/analytics/progress-chart";
import { TimeUsageChart } from "@/components/analytics/time-usage-chart";
import { EfficiencyScore } from "@/components/analytics/efficiency-score";
import { BurnoutPredictor } from "@/components/analytics/burnout-predictor";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

export default function AnalyticsPage() {
  return (
    <div className="container mx-auto px-4 py-6 md:py-8 space-y-6 md:space-y-8">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl sm:text-3xl font-bold">
            Your Productivity Analytics
          </CardTitle>
          <CardDescription className="text-base md:text-lg">
            Gain insights into your work habits, progress, and well-being.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-2">
        <ProgressPieChart />
        <TimeUsageChart />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2">
        <EfficiencyScore />
        <BurnoutPredictor />
      </div>
    </div>
  );
}
