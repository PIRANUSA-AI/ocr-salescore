import axios from 'axios';
import * as cheerio from 'cheerio';
import { adminDb } from '@/lib/firebase-admin';

const SERPAPI_KEY = process.env.SERPAPI_KEY || '1e83f6ffd43c99d2bedc4c6922c4ac5450b66acf3d5e924436a89e3d435150cc';
const SEARCH_QUOTA_LIMIT = 200;

/**
 * Checks and increments the monthly search quota.
 * Resets automatically if the month has changed.
 * Returns true if quota is available, false otherwise.
 */
async function checkAndIncrementQuota(): Promise<boolean> {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${now.getMonth() + 1}`; // e.g., "2025-12"

    const quotaRef = adminDb.collection('system_quotas').doc('serpapi_search');

    try {
        const result = await adminDb.runTransaction(async (t) => {
            const doc = await t.get(quotaRef);

            let usage = 0;
            let lastUpdateMonth = '';

            if (doc.exists) {
                const data = doc.data();
                usage = data?.usage || 0;
                lastUpdateMonth = data?.month || '';
            }

            // Reset quota if month changed
            if (lastUpdateMonth !== currentMonth) {
                usage = 0;
            }

            if (usage >= SEARCH_QUOTA_LIMIT) {
                return false; // Quota exceeded
            }

            // Increment usage
            t.set(quotaRef, {
                usage: usage + 1,
                month: currentMonth,
                updatedAt: new Date().toISOString()
            });

            return true;
        });

        return result;

    } catch (error) {
        console.error("Quota check failed (Fail-Open):", error);
        // Fail Open: Allow search to proceed even if quota check errors (to prioritize functionality)
        return true;
    }
}

export type SearchResult = {
    title: string;
    link: string;
    snippet: string;
    source: 'linkedin' | 'google_organic';
};

/**
 * Searches SerpApi for a company.
 * Returns ALL candidates for the flow to iterate through.
 */
export async function searchCompany(companyName: string): Promise<SearchResult[]> {
    const hasQuota = await checkAndIncrementQuota();
    if (!hasQuota) {
        console.warn("SerpApi Quota Exceeded. Falling back to AI only.");
        return [];
    }

    const allCandidates: SearchResult[] = [];

    try {
        // 1. Try LinkedIn Search first
        const linkedinQuery = `site:linkedin.com/company "${companyName}" Indonesia`;
        console.log(`[SerpApi] LinkedIn Query: ${linkedinQuery}`);
        const linkedinResults = await performSerpSearch(linkedinQuery);

        if (linkedinResults && linkedinResults.length > 0) {
            console.log(`[SerpApi] LinkedIn Candidates Found: ${linkedinResults.length}`);
            linkedinResults.forEach((r, i) => console.log(`  ${i + 1}. ${r.title} -> ${r.link}`));

            linkedinResults.forEach(r => {
                allCandidates.push({ ...r, source: 'linkedin' });
            });
        }

        // 2. Also add Google Organic results as backup candidates
        const googleQuery = `"${companyName}" official website Indonesia`;
        console.log(`[SerpApi] Google Query: ${googleQuery}`);
        const googleResults = await performSerpSearch(googleQuery);

        if (googleResults && googleResults.length > 0) {
            console.log(`[SerpApi] Google Candidates Found: ${googleResults.length}`);
            googleResults.forEach((r, i) => console.log(`  ${i + 1}. ${r.title} -> ${r.link}`));

            googleResults.forEach(r => {
                // Avoid duplicates
                if (!allCandidates.find(c => c.link === r.link)) {
                    allCandidates.push({ ...r, source: 'google_organic' });
                }
            });
        }

        return allCandidates;

    } catch (error) {
        console.error("Search failed:", error);
        return allCandidates;
    }
}

async function performSerpSearch(query: string): Promise<{ title: string, link: string, snippet: string }[]> {
    const response = await axios.get('https://serpapi.com/search', {
        params: {
            api_key: SERPAPI_KEY,
            engine: 'google',
            q: query,
            num: 3,
            hl: 'id',
            gl: 'id'
        }
    });

    if (response.data.organic_results) {
        return response.data.organic_results.map((r: any) => ({
            title: r.title,
            link: r.link,
            snippet: r.snippet
        }));
    }

    return [];
}

/**
 * Scrapes the content of a website and returns cleaned text.
 */
export async function scrapeWebsiteContent(url: string, maxLength: number = 8000): Promise<string> {
    try {
        console.log(`[SerpApi] Scraping: ${url}`);
        const response = await axios.get(url, {
            timeout: 10000,
            headers: {
                // Mimic a real browser
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        const $ = cheerio.load(response.data);

        // Cleanup
        $('script').remove();
        $('style').remove();
        $('nav').remove();
        $('footer').remove();
        $('iframe').remove();
        $('svg').remove();
        $('[role="alert"]').remove();

        // Extract Text
        let text = $('body').text();

        // Normalize whitespace
        text = text.replace(/\s+/g, ' ').trim();

        // Truncate
        if (text.length > maxLength) {
            text = text.substring(0, maxLength) + "... [Truncated]";
        }

        return text || "No readable content found.";

    } catch (error: any) {
        console.error(`[SerpApi] Failed to scrape ${url}:`, error.message);
        return ""; // Return empty string on failure
    }
}

/**
 * Fetches real-time account info from SerpApi.
 * Returns the number of searches used this month.
 */
export async function getAccountInfo(): Promise<{ total_searches_left: number, this_month_usage: number, searches_per_month: number } | null> {
    try {
        const response = await axios.get('https://serpapi.com/account', {
            params: {
                api_key: SERPAPI_KEY
            }
        });

        if (response.data) {
            console.log("[SerpApi Account] Raw Response:", JSON.stringify(response.data, null, 2));
            return {
                total_searches_left: response.data.total_searches_left || 0,
                this_month_usage: response.data.this_month_usage || 0,
                searches_per_month: response.data.searches_per_month || 0,
            };
        }
        return null;
    } catch (error) {
        console.error("Failed to fetch SerpApi account info:", error);
        return null;
    }
}
