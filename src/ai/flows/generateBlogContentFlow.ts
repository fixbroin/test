'use server';
/**
 * @fileOverview An AI flow to generate comprehensive blog content and SEO metadata for home services in HTML format.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { cleanSeoString, truncateSeoString } from '@/lib/seoAdvancedUtils';

const GenerateBlogContentInputSchema = z.object({
  title: z.string().describe("The title of the blog post to generate content for."),
  categoryName: z.string().optional().describe("The optional category name for more specific SEO generation (e.g., Carpentry, Plumber, Electrician)."),
  currentYear: z.string().optional().describe("The current year for dynamic content generation."),
});
export type GenerateBlogContentInput = z.infer<typeof GenerateBlogContentInputSchema>;

const GenerateBlogContentOutputSchema = z.object({
  content: z.string().describe("The full blog post content, formatted in HTML with <h2>, <p>, <br>, and <ul> tags. Should be engaging, professional, and at least 400 words, aimed at homeowners. Include 5-7 sections with headers, benefits, service lists, tips, pricing estimates, and a footer with keywords."),
  excerpt: z.string().describe("A short, catchy summary of the blog post (max 150 characters) to be used on the blog list card."),
  tags: z.string().describe("A comma-separated string of 3-5 relevant tags for the post (e.g., 'Maintenance, DIY, Plumbing')."),
  readingTime: z.string().describe("Estimated reading time, e.g., '5 min' or '8 min'."),
  h1_title: z.string().describe("An H1 title for the blog page."),
  meta_title: z.string().describe("An SEO-optimized meta title, under 60 characters."),
  meta_description: z.string().describe("An SEO-optimized meta description, under 160 characters."),
  meta_keywords: z.string().describe("A comma-separated string of SEO keywords."),
  imageHint: z.string().describe("One or two keywords for an AI image search for the blog's cover image. Max 50 characters."),
});
export type GenerateBlogContentOutput = z.infer<typeof GenerateBlogContentOutputSchema>;

export async function generateBlogContent(input: Omit<GenerateBlogContentInput, 'currentYear'>): Promise<GenerateBlogContentOutput> {
  const currentYear = new Date().getFullYear().toString();
  return generateBlogContentFlow({ ...input, currentYear });
}

const prompt = ai.definePrompt({
  name: 'generateHomeServicesBlogPrompt',
  input: { schema: GenerateBlogContentInputSchema },
  output: { schema: GenerateBlogContentOutputSchema },
  prompt: `You are an expert Local SEO copywriter for "FixBro", Bangalore's leading home services platform.
Your task is to write an advanced, high-authority blog post that dominates search results in Bangalore.

**STRATEGIC SEO GUIDELINES:**
1. **Avoid Keyword Stuffing**: Do not repeat "{{title}}" or "Bangalore" excessively. Use semantic variations (e.g., "Home maintenance" instead of "Home services").
2. **Local Authority**: Integrate Bangalore neighborhoods like Koramangala, Whitefield, Indiranagar, and HSR Layout naturally.
3. **Rich Snippets**: Structure the content with <h2> headers and use <ul> lists for readability and Google's featured snippets.
4. **Intent-Driven**: Use "Best", "Professional", "Expert Guide", "Trusted Solutions".

**Input Details:**
- Blog Post Title: {{title}}
- Category (optional): {{categoryName}}
- Current Year: {{currentYear}}

**OUTPUT INSTRUCTIONS:**
- **content**: At least 600 words of high-quality, professional advice formatted in HTML. Include sections on benefits, expert tips, and why choosing a professional in Bangalore matters.
- **excerpt**: A high-CTR summary under 150 chars.
- **h1_title**: Dynamic and authoritative. E.g., "{{title}}: The Ultimate Guide for Bangalore Homeowners".
- **meta_title**: Punchy, under 60 chars.
- **meta_description**: Compelling summary under 160 chars.

Return the entire response as a single, valid JSON object.
`,
});

const generateBlogContentFlow = ai.defineFlow(
  {
    name: 'generateHomeServicesBlogFlow',
    inputSchema: GenerateBlogContentInputSchema,
    outputSchema: GenerateBlogContentOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    if (!output) {
      throw new Error("AI failed to generate a valid blog post response.");
    }

    // Clean SEO strings to ensure no redundant words
    return {
      ...output,
      h1_title: cleanSeoString(output.h1_title),
      meta_title: truncateSeoString(cleanSeoString(output.meta_title), 60),
      meta_description: truncateSeoString(cleanSeoString(output.meta_description), 160),
      excerpt: truncateSeoString(cleanSeoString(output.excerpt), 150),
    };
  }
);