import { GeminiServiceError, interpretUserTurnWithAI } from '../services/gemini.service.js';

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

function sanitizeConversation(conversation) {
  if (conversation === undefined) return [];
  if (!Array.isArray(conversation) || conversation.length > 10) return null;

  return conversation.map((item) => {
    const role = item?.role === 'assistant' ? 'assistant' : item?.role === 'user' ? 'user' : '';
    const text = typeof item?.text === 'string' ? item.text.trim().slice(0, 500) : '';
    return { role, text };
  }).filter((item) => item.role && item.text);
}

export const handleAssistantTurn = async (req, res) => {
  try {
    const { query, conversation, pageUrl, textContext } = req.body;

    if (typeof query !== 'string' || !query.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Query is required.',
      });
    }
    if (query.length > 1_000) {
      return res.status(400).json({ success: false, message: 'Query is too long.' });
    }

    const safeConversation = sanitizeConversation(conversation);
    if (safeConversation === null) {
      return res.status(400).json({ success: false, message: 'Conversation history is invalid.' });
    }
    if (pageUrl !== undefined && (typeof pageUrl !== 'string' || pageUrl.length > 2_048)) {
      return res.status(400).json({ success: false, message: 'Page URL is invalid.' });
    }
    if (textContext !== undefined && (typeof textContext !== 'string' || textContext.length > 4_000)) {
      return res.status(400).json({ success: false, message: 'Page text is invalid or too long.' });
    }

    const data = await interpretUserTurnWithAI({
      query: query.trim(),
      conversation: safeConversation,
      pageUrl,
      textContext,
    });

    data.personName = typeof data.personName === 'string' ? data.personName.slice(0, 120) : '';
    data.companyName = typeof data.companyName === 'string' ? data.companyName.slice(0, 120) : '';

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return sendAiError(res, error);
  }
};
