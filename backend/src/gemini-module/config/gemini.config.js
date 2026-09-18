import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY environment variable is missing.');
}

export const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Clean prefix if passed via env
export const geminiModels = {
  primary: ('gemini-3.5-flash-lite').replace(/^models\//, ''),
  fallback: ('gemini-3.7-flash').replace(/^models\//, ''),
  // primary: (process.env.PRIMARY_GEMINI_MODEL || 'gemini-2.5-flash').replace(/^models\//, ''),
  // fallback: (process.env.FALLBACK_GEMINI_MODEL || 'gemini-2.5-pro').replace(/^models\//, ''),
};