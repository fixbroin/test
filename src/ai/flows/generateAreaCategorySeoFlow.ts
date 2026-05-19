
'use server';
/**
 * @fileOverview An AI flow to generate SEO content for a specific service category within a specific area of a city.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { cleanSeoString, truncateSeoString } from '@/lib/seoAdvancedUtils';

const GenerateAreaCategorySeoInputSchema = z.object({
  areaName: z.string().describe("The name of the specific area or locality, e.g., 'Whitefield'."),
  cityName: z.string().describe("The name of the parent city, e.g., 'Bangalore'."),
  categoryName: z.string().describe("The name of the service category, e.g., 'Carpentry'."),
});
export type GenerateAreaCategorySeoInput = z.infer<typeof GenerateAreaCategorySeoInputSchema>;

const GenerateAreaCategorySeoOutputSchema = z.object({
  h1_title: z.string().describe("An H1 title optimized for the area-category page."),
  meta_title: z.string().describe("An SEO-optimized meta title, under 60 characters."),
  meta_description: z.string().describe("An SEO-optimized meta description, under 160 characters."),
  meta_keywords: z.string().describe("A comma-separated string of 10 highly relevant hyper-local SEO keywords."),
  seo_content: z.string().describe("A 200-300 word long-form SEO bio for the area-category, including benefits and local relevance."),
  faqs: z.array(z.object({
    question: z.string(),
    answer: z.string()
  })).describe("3-5 hyper-local FAQs about the service in this specific area."),
});
export type GenerateAreaCategorySeoOutput = z.infer<typeof GenerateAreaCategorySeoOutputSchema>;

export async function generateAreaCategorySeo(input: GenerateAreaCategorySeoInput): Promise<GenerateAreaCategorySeoOutput> {
  return generateAreaCategorySeoFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateAreaCategorySeoPrompt',
  input: { schema: GenerateAreaCategorySeoInputSchema },
  output: { schema: GenerateAreaCategorySeoOutputSchema },
  prompt: `You are an expert Local SEO copywriter for "FixBro", Bangalore's top home services platform.
Your task is to generate advanced, hyper-local SEO content for a specific service category within a Bangalore neighborhood.

Area Name: {{areaName}}
City Name: {{cityName}} (usually Bangalore)
Category Name: {{categoryName}}

**CRITICAL SEO RULES:**
1. **Exact Match Only**: Do NOT start with "Best", "Top-Rated", or "Professional". Your primary keyword MUST be "{{categoryName}} in {{areaName}}". If {{categoryName}} is a "service" noun (like Carpentry), transform it into the "person" noun (like Carpenter) for the primary keyword.
2. **Keyword First**: The H1 and Meta Title MUST start with "{{categoryName}} in {{areaName}}".
3. **Hyper-Localization**: You MUST mention at least 2 specific landmarks, parks, or famous spots in or near {{areaName}}, Bangalore (e.g., Phoenix Marketcity if in Whitefield, BDA Complex if in HSR).
4. **Natural Repetition**: Use "{{categoryName}} in {{areaName}}" naturally at least 3 times in the bio.
5. **No Filler**: Eliminate fluffy marketing adjectives from the beginning of strings.

**OUTPUT FIELDS:**
1.  **h1_title**: MUST be exactly "{{categoryName}} in {{areaName}}".
2.  **meta_title**: Exactly "{{categoryName}} in {{areaName}} | {{categoryName}} Near Me | FixBro".
3.  **meta_description**: Compelling, including the primary keyword and a call to action. Max 160 chars.
4.  **meta_keywords**: 10 high-intent, hyper-local keywords including variations like "{{categoryName}} near me {{areaName}}", "best {{categoryName}} {{areaName}}", etc.
5.  **seo_content**: A 250-350 word professional, engaging bio. It MUST be unique. It must include the primary keyword multiple times, describe the quality of service, mention {{areaName}} specific landmarks or local "vibes", and end with a strong reason to book via FixBro. Use HTML tags like <p>, <strong>, and <br> for formatting.
6.  **faqs**: Generate 3-5 Frequently Asked Questions that residents of {{areaName}} would ask about {{categoryName}} services. Answers should be helpful, include the locality name, and mention why FixBro is the best choice for {{areaName}} residents.

Return the entire response as a single, valid JSON object.
`,
});

const generateAreaCategorySeoFlow = ai.defineFlow(
  {
    name: 'generateAreaCategorySeoFlow',
    inputSchema: GenerateAreaCategorySeoInputSchema,
    outputSchema: GenerateAreaCategorySeoOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    if (!output) {
      throw new Error("AI failed to generate a valid SEO response for the area-category.");
    }

    return {
      h1_title: cleanSeoString(output.h1_title),
      meta_title: truncateSeoString(cleanSeoString(output.meta_title), 60),
      meta_description: truncateSeoString(cleanSeoString(output.meta_description), 160),
      meta_keywords: output.meta_keywords,
      seo_content: output.seo_content,
      faqs: output.faqs,
    };
  }
);
