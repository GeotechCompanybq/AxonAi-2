"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { TrendingUp, Zap, AlertCircle, CheckCircle2 } from "lucide-react";
import { getTasksFromLocalStorage } from "@/lib/task-storage";
import { format } from "date-fns";
import { IconSpinner } from "@/components/icons";
import { computeEfficiencyScoreLocal } from "@/lib/local-insights";

export function EfficiencyScore() {
  const [scoreData, setScoreData] = useState<
    | {
        score: number;
        message: string;
        positiveFeedback?: string;
        improvementSuggestion?: string;
      }
    | null
  >(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    function compute() {
      setIsLoading(true);
      const tasks = getTasksFromLocalStorage();
      const currentDate = format(new Date(), "yyyy-MM-dd");

      try {
        const result = computeEfficiencyScoreLocal(tasks, currentDate);
        setScoreData(result);
      } catch (error) {
        console.error("Error fetching efficiency score:", error);
        setScoreData({
          score: 0,
          message: "Error calculating score. Please try again.",
        });
      } finally {
        setIsLoading(false);
      }
    }
    compute();
  }, []);

  let scoreColor = "text-primary"; // Default gold-ish
  let IconComponent = Zap;

  if (scoreData) {
    if (scoreData.score >= 85) {
      scoreColor = "text-green-500";
      IconComponent = CheckCircle2;
    } else if (scoreData.score >= 60) {
      scoreColor = "text-yellow-500";
      IconComponent = TrendingUp;
    } else {
      scoreColor = "text-red-500";
      IconComponent = AlertCircle;
    }
  }

  return (
    <Card className="shadow-lg h-full">
      <CardHeader className="pb-2">
        <div className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base font-medium">
            AI Efficiency Score
          </CardTitle>
          {isLoading ? (
            <IconSpinner className="h-5 w-5 text-primary" />
          ) : (
            <IconComponent className={`h-5 w-5 ${scoreColor}`} />
          )}
        </div>
        {scoreData && !isLoading && (
          <CardDescription className="text-xs pt-1">
            {scoreData.message}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-3xl sm:text-4xl font-bold text-muted-foreground animate-pulse">
            --%
          </div>
        ) : scoreData ? (
          <>
            <div className={`text-3xl sm:text-4xl font-bold ${scoreColor}`}>
              {scoreData.score}%
            </div>
            {scoreData.positiveFeedback && (
              <p className="text-xs sm:text-sm text-green-400 mt-2">
                {scoreData.positiveFeedback}
              </p>
            )}
            {scoreData.improvementSuggestion && (
              <p className="text-xs sm:text-sm text-amber-400 mt-2">
                {scoreData.improvementSuggestion}
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Based on local analysis of task completion, timeliness, and priorities.
            </p>
          </>
        ) : (
          <p className="text-muted-foreground">
            Could not load efficiency score.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
