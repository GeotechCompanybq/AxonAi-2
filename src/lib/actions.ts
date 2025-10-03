"use server";

import {
  createSchedule as createScheduleFlow,
  type CreateScheduleInput,
  type CreateScheduleOutput,
} from "@/ai/flows/create-schedule";

import {
  analyzeTimeUsage as analyzeTimeUsageFlow,
  type AnalyzeTimeUsageInput,
  type AnalyzeTimeUsageOutput,
} from "@/ai/flows/analyze-time-usage";

import {
  calculateEfficiencyScore as calculateEfficiencyScoreFlow,
  type CalculateEfficiencyScoreInput,
  type CalculateEfficiencyScoreOutput,
} from "@/ai/flows/calculate-efficiency-score";

import {
  predictBurnout as predictBurnoutFlow,
  type PredictBurnoutInput,
  type PredictBurnoutOutput,
} from "@/ai/flows/predict-burnout";

import {
  intelligentTaskBreakdown as intelligentTaskBreakdownFlow,
  type IntelligentTaskBreakdownInput,
  type IntelligentTaskBreakdownOutput,
} from "@/ai/flows/intelligent-task-breakdown";

import {
  speechMeetingAware as speechMeetingAwareFlow,
  type SpeechMeetingAwareInput,
  type SpeechMeetingAwareOutput,
} from "@/ai/flows/speech-meeting-aware";

export async function handleCreateSchedule(
  input: CreateScheduleInput
): Promise<CreateScheduleOutput> {
  try {
    const result = await createScheduleFlow(input);
    // Ensure tasks is at least an empty array if undefined/null from AI
    return { ...result, tasks: result.tasks || [] };
  } catch (error) {
    console.error("Error in handleCreateSchedule:", error);
    throw new Error("Failed to create schedule. Please try again.");
  }
}

export async function handleAnalyzeTimeUsage(
  input: AnalyzeTimeUsageInput
): Promise<AnalyzeTimeUsageOutput> {
  try {
    const result = await analyzeTimeUsageFlow(input);
    return result;
  } catch (error) {
    console.error("Error in handleAnalyzeTimeUsage:", error);
    throw error;
  }
}

export async function handleCalculateEfficiencyScore(
  input: CalculateEfficiencyScoreInput
): Promise<CalculateEfficiencyScoreOutput> {
  try {
    const result = await calculateEfficiencyScoreFlow(input);
    // Sanitize result to ensure a numeric score and non-empty message
    const rawScore = (result as any)?.score;
    let score = Number(rawScore);
    if (!Number.isFinite(score)) score = 0;
    if (score < 0) score = 0;
    if (score > 100) score = 100;
    const message = (result as any)?.message || "Efficiency score calculated.";
    const positiveFeedback = (result as any)?.positiveFeedback;
    const improvementSuggestion = (result as any)?.improvementSuggestion;
    return { score, message, positiveFeedback, improvementSuggestion };
  } catch (error) {
    console.error("Error in handleCalculateEfficiencyScore:", error);
    return {
      score: 0,
      message: "Error calculating efficiency score.",
      improvementSuggestion: "Please try again later.",
    };
  }
}

export async function handlePredictBurnout(
  input: PredictBurnoutInput
): Promise<PredictBurnoutOutput> {
  try {
    const result = await predictBurnoutFlow(input);
    return result;
  } catch (error) {
    console.error("Error in handlePredictBurnout:", error);
    return {
      riskLevel: "medium",
      progressValue: 50,
      message: "Error predicting burnout risk. Please monitor your well-being.",
      contributingFactors: ["Analysis service unavailable"],
    };
  }
}

export async function handleIntelligentTaskBreakdown(
  input: IntelligentTaskBreakdownInput
): Promise<IntelligentTaskBreakdownOutput> {
  try {
    const result = await intelligentTaskBreakdownFlow(input);
    return result;
  } catch (error) {
    console.error("Error in handleIntelligentTaskBreakdown:", error);
    return { subTasks: [] };
  }
}

export async function handleSpeechMeetingAware(
  input: SpeechMeetingAwareInput
): Promise<SpeechMeetingAwareOutput> {
  try {
    const result = await speechMeetingAwareFlow(input);
    return result;
  } catch (error) {
    console.error("Error in handleSpeechMeetingAware:", error);
    return {
      adjustedTasks: "Unable to adjust tasks due to an error.",
      reminders: "Please try again later.",
      speakerChecklist: "1) Check mic 2) Check slides 3) Arrive early",
    };
  }
}
