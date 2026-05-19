
'use server';
/**
 * @fileOverview An AI flow to generate SEO content for a city page.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { cleanSeoString, truncateSeoString } from '@/lib/seoAdvancedUtils';

const GenerateCitySeoInputSchema = z.object({
  cityName: z.string().describe("The name of the city, e.g., 'Bangalore' or 'Whitefield'."),
});
export type GenerateCitySeoInput = z.infer<typeof GenerateCitySeoInputSchema>;

const GenerateCitySeoOutputSchema = z.object({
  h1_title: z.string().describe("An H1 title optimized for the city page."),
  seo_title: z.string().describe("An SEO-optimized meta title, under 60 characters."),
  seo_description: z.string().describe("An SEO-optimized meta description, under 160 characters."),
  seo_keywords: z.string().describe("A comma-separated string of 10 relevant SEO keywords for the city."),
});
export type GenerateCitySeoOutput = z.infer<typeof GenerateCitySeoOutputSchema>;

export async function generateCitySeo(input: GenerateCitySeoInput): Promise<GenerateCitySeoOutput> {
  return generateCitySeoFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateCitySeoPrompt',
  input: { schema: GenerateCitySeoInputSchema },
  output: { schema: GenerateCitySeoOutputSchema },
  prompt: `You are an expert Local SEO copywriter for "FixBro", Bangalore's leading home services platform.
Your goal is to generate high-authority SEO content for the main city page to dominate local search results.

City Name: {{cityName}}

**CRITICAL SEO RULES:**
1. **City Dominance**: Use "{{cityName}}" as the primary keyword. Target "Home Services in {{cityName}}".
2. **Keyword First**: Do NOT start with "Best" or "Professional". The H1 and Title MUST start with "Home Services in {{cityName}}".
3. **Intent Phrases**: Include "near me" later, like "Home Services in {{cityName}} | Handyman Near Me | FixBro".
4. **Keyword density**: Repeat the city and "home services" frequently to signal relevance to Google.

**OUTPUT FIELDS:**
1.  **h1_title**: MUST be exactly "Home Services in {{cityName}}".
2.  **seo_title**: Exactly "Home Services in {{cityName}} | Handyman Near Me | FixBro".
3.  **seo_description**: A compelling meta description under 160 chars including the primary keyword and city neighborhoods.
4.  **seo_keywords**: 10 high-volume, localized keywords like "home services {{cityName}}", "handyman {{cityName}}", "best repair services {{cityName}}", etc.

Return the entire response as a single, valid JSON object.
`,
});

const generateCitySeoFlow = ai.defineFlow(
  {
    name: 'generateCitySeoFlow',
    inputSchema: GenerateCitySeoInputSchema,
    outputSchema: GenerateCitySeoOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    if (!output) {
      throw new Error("AI failed to generate a valid SEO response for the city.");
    }

    return {
      h1_title: cleanSeoString(output.h1_title),
      seo_title: truncateSeoString(cleanSeoString(output.seo_title), 60),
      seo_description: truncateSeoString(cleanSeoString(output.seo_description), 160),
      seo_keywords: output.seo_keywords,
    };
  }
);
