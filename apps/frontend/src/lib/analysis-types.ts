import type { ProspectData, WebinarAnalysisOutput } from '@/types';
import type { TopicRecommendation } from '@/ai/flows/recommend-next-topic';

export type WebinarAnalysisInput = {
  webinarTitle: string;
  webinarDate: Date;
  feedbackData: string;
  userId: string;
};

export type WebinarAnalysisResult =
  | {
      success: true;
      analysisId: string;
      webinarTitle: string;
      webinarDate: string;
      createdAt: string;
      analysis: {
        insights?: WebinarAnalysisOutput;
        topicRecommendation: TopicRecommendation | null;
      };
      prospects: ProspectData[];
      topicsGenerated: boolean;
    }
  | { success: false; error: string };
