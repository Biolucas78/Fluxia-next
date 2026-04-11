/**
 * Utility functions for Bling API integration
 */

/**
 * Fetches a URL with retry logic and exponential backoff
 */
export async function fetchWithRetry(url: string, options: any, retries = 5, backoff = 2000): Promise<Response> {
  try {
    const response = await fetch(url, options);
    
    // If rate limited (429), retry
    if (response.status === 429 && retries > 0) {
      console.log(`[Bling API] Rate limited (429). Retrying in ${backoff}ms... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, backoff));
      return fetchWithRetry(url, options, retries - 1, backoff * 2);
    }
    
    // If server error (500, 502, 503, 504), retry
    if (response.status >= 500 && retries > 0) {
      console.log(`[Bling API] Server error (${response.status}). Retrying in ${backoff}ms... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, backoff));
      return fetchWithRetry(url, options, retries - 1, backoff * 2);
    }
    
    return response;
  } catch (error) {
    if (retries > 0) {
      console.log(`[Bling API] Network error. Retrying in ${backoff}ms... (${retries} retries left)`, error);
      await new Promise(resolve => setTimeout(resolve, backoff));
      return fetchWithRetry(url, options, retries - 1, backoff * 2);
    }
    throw error;
  }
}
