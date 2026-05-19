
'use server';
/**
 * @fileOverview An AI flow to generate SEO content for a specific service category within a city.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { cleanSeoString, truncateSeoString } from '@/lib/seoAdvancedUtils';

const GenerateCityCategorySeoInputSchema = z.object({
  cityName: z.string().describe("The name of the city, e.g., 'Bangalore'."),
  categoryName: z.string().describe("The name of the service category, e.g., 'Carpentry'."),
});
export type GenerateCityCategorySeoInput = z.infer<typeof GenerateCityCategorySeoInputSchema>;

const GenerateCityCategorySeoOutputSchema = z.object({
  h1_title: z.string().describe("An H1 title optimized for the city-category page."),
  meta_title: z.string().describe("An SEO-optimized meta title, under 60 characters."),
  meta_description: z.string().describe("An SEO-optimized meta description, under 160 characters."),
  meta_keywords: z.string().describe("A comma-separated string of 10 highly relevant local SEO keywords."),
  seo_content: z.string().describe("A 200-300 word long-form SEO bio for the city-category, including benefits and Bangalore relevance."),
  faqs: z.array(z.object({
    question: z.string(),
    answer: z.string()
  })).describe("3-5 local FAQs about the service in this city."),
});
export type GenerateCityCategorySeoOutput = z.infer<typeof GenerateCityCategorySeoOutputSchema>;

export async function generateCityCategorySeo(input: GenerateCityCategorySeoInput): Promise<GenerateCityCategorySeoOutput> {
  return generateCityCategorySeoFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateCityCategorySeoPrompt',
  input: { schema: GenerateCityCategorySeoInputSchema },
  output: { schema: GenerateCityCategorySeoOutputSchema },
  prompt: `You are an expert Local SEO copywriter for "FixBro", Bangalore's leading home services platform.
Your task is to generate advanced, high-intent SEO content for a specific service category within Bangalore.

City Name: {{cityName}}
Category Name: {{categoryName}}

**CRITICAL SEO RULES:**
1. **Exact Match Priority**: Do NOT start with "Best", "Top-Rated", or "Professional". Your primary keyword MUST be "{{categoryName}} in {{cityName}}". If {{categoryName}} is a "service" noun (like Carpentry), transform it into the "person" noun (like Carpenter) for the primary keyword.
2. **Keyword First**: The H1 and Meta Title MUST start with "{{categoryName}} in {{cityName}}".
3. **Intent Keywords**: Include "near me" later in the title, like "{{categoryName}} in {{cityName}} | {{categoryName}} Near Me".
4. **Local Authority**: Put the primary keyword (e.g., "Carpenter in Bangalore") at the very beginning.

**OUTPUT FIELDS:**
1.  **h1_title**: MUST be exactly "{{categoryName}} in {{cityName}}".
2.  **meta_title**: Exactly "{{categoryName}} in {{cityName}} | {{categoryName}} Near Me | FixBro".
3.  **meta_description**: A compelling summary under 160 chars including the primary keyword.
4.  **meta_keywords**: 10 high-intent, city-specific keywords like "{{categoryName}} near me", "{{categoryName}} {{cityName}}", etc.
5.  **seo_content**: A 200-300 word professional bio for this service category in Bangalore. Mention how FixBro serves all major areas (Koramangala, Indiranagar, Whitefield, etc.), emphasize quality, safety, and why FixBro is the preferred choice for {{cityName}} residents. Use HTML tags like <p>, <strong>, and <br> for formatting.
6.  **faqs**: Generate 3-5 Frequently Asked Questions that residents of {{cityName}} would ask about {{categoryName}} services. Include mentions of Bangalore neighborhoods.

Return the entire response as a single, valid JSON object.
`,
});

const generateCityCategorySeoFlow = ai.defineFlow(
  {
    name: 'generateCityCategorySeoFlow',
    inputSchema: GenerateCityCategorySeoInputSchema,
    outputSchema: GenerateCityCategorySeoOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    if (!output) {
      throw new Error("AI failed to generate a valid SEO response for the city-category.");
    }

    // Clean and strictly truncate
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
