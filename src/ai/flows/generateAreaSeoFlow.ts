
'use server';
/**
 * @fileOverview An AI flow to generate SEO content for a specific service area within a city.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { cleanSeoString, truncateSeoString } from '@/lib/seoAdvancedUtils';

const GenerateAreaSeoInputSchema = z.object({
  areaName: z.string().describe("The name of the specific area or locality, e.g., 'Whitefield'."),
  cityName: z.string().describe("The name of the parent city, e.g., 'Bangalore'."),
});
export type GenerateAreaSeoInput = z.infer<typeof GenerateAreaSeoInputSchema>;

const GenerateAreaSeoOutputSchema = z.object({
  h1_title: z.string().describe("An H1 title optimized for the area page."),
  seo_title: z.string().describe("An SEO-optimized meta title, under 60 characters."),
  seo_description: z.string().describe("An SEO-optimized meta description, under 160 characters."),
  seo_keywords: z.string().describe("A comma-separated string of 10 highly relevant SEO keywords for the area."),
});
export type GenerateAreaSeoOutput = z.infer<typeof GenerateAreaSeoOutputSchema>;

export async function generateAreaSeo(input: GenerateAreaSeoInput): Promise<GenerateAreaSeoOutput> {
  return generateAreaSeoFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateAreaSeoPrompt',
  input: { schema: GenerateAreaSeoInputSchema },
  output: { schema: GenerateAreaSeoOutputSchema },
  prompt: `You are an expert Local SEO copywriter for "FixBro", the leading home services platform in Bangalore, India.
Your task is to generate high-performance SEO content for a specific locality or neighborhood within Bangalore.

Area Name: {{areaName}}
City Name: {{cityName}} (usually Bangalore)

**CRITICAL SEO RULES:**
1. **Locality Focus**: Use "{{areaName}}" as the primary location signal. Target phrases like "Home Services in {{areaName}}".
2. **Keyword First**: Do NOT start with "Best" or "Top-Rated". The H1 and Title MUST start with "Home Services in {{areaName}}".
3. **Intent Keywords**: Include "near me" later, like "Home Services in {{areaName}} | Handyman Near Me | FixBro".
4. **Keyword density**: Repeat the area name naturally but frequently.

**OUTPUT FIELDS:**
1.  **h1_title**: MUST be exactly "Home Services in {{areaName}}".
2.  **seo_title**: Exactly "Home Services in {{areaName}} | Handyman Near Me | FixBro".
3.  **seo_description**: A compelling summary mentioning {{areaName}} and the reliability of FixBro experts. Max 160 chars.
4.  **seo_keywords**: 10 hyper-local keywords like "handyman {{areaName}}", "home repair {{areaName}}", "best services in {{areaName}}", etc.

Return the entire response as a single, valid JSON object.
`,
});

const generateAreaSeoFlow = ai.defineFlow(
  {
    name: 'generateAreaSeoFlow',
    inputSchema: GenerateAreaSeoInputSchema,
    outputSchema: GenerateAreaSeoOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    if (!output) {
      throw new Error("AI failed to generate a valid SEO response for the area.");
    }

    return {
      h1_title: cleanSeoString(output.h1_title),
      seo_title: truncateSeoString(cleanSeoString(output.seo_title), 60),
      seo_description: truncateSeoString(cleanSeoString(output.seo_description), 160),
      seo_keywords: output.seo_keywords,
    };
  }
);
