import { GeminiServiceError, processScannedDataWithAI } from '../services/gemini.service.js';

function sendAiError(res, error) {
  console.error('Controller Error:', error);
  const statusCode = error instanceof GeminiServiceError && [429, 503].includes(error.statusCode)
    ? error.statusCode
    : 502;
  return res.status(statusCode).json({
    success: false,
    message: statusCode === 429
      ? 'The AI service is rate-limited. Please try again shortly.'
      : 'The AI service is temporarily unavailable. Please try again shortly.',
  });
}

export const handleScannedData = async (req, res) => {
  try {
    const { query, textContext, extractedLinks, pageUrl } = req.body;

    if (typeof query !== 'string' || !query.trim()) {
      return res.status(400).json({ 
        success: false, 
        message: 'Query is required.' 
      });
    }
    if (query.length > 1_000) {
      return res.status(400).json({ success: false, message: 'Query is too long.' });
    }
    if (textContext !== undefined && (typeof textContext !== 'string' || textContext.length > 20_000)) {
      return res.status(400).json({ success: false, message: 'Page text is invalid or too long.' });
    }
    if (extractedLinks !== undefined && (!Array.isArray(extractedLinks) || extractedLinks.length > 100)) {
      return res.status(400).json({ success: false, message: 'Links are invalid or too numerous.' });
    }
    if (pageUrl !== undefined && (typeof pageUrl !== 'string' || pageUrl.length > 2_048)) {
      return res.status(400).json({ success: false, message: 'Page URL is invalid.' });
    }

    const safeLinks = (extractedLinks || []).map((link) => ({
      text: typeof link?.text === 'string' ? link.text.slice(0, 500) : '',
      url: typeof link?.url === 'string' ? link.url.slice(0, 2_048) : '',
    })).filter((link) => {
      try {
        const url = new URL(link.url);
        return link.text && (url.protocol === 'http:' || url.protocol === 'https:');
      } catch {
        return false;
      }
    });

    // Call service to interact with Gemini API
    const answer = await processScannedDataWithAI({
      query: query.trim(),
      textContext,
      extractedLinks: safeLinks,
      pageUrl
    });

    // Send response back to Frontend / Chrome Extension
    return res.status(200).json({
      success: true,
      data: {
        answer
      }
    });

  } catch (error) {
    return sendAiError(res, error);
  }
};
