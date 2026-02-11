import { GoogleGenAI } from "@google/genai";

// Always initialize the SDK using process.env.API_KEY directly as per guidelines.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getTaxAdvice = async (prompt: string) => {
  try {
    // Calling generateContent with the model name and prompt directly.
    // Basic text tasks like tax advice use 'gemini-3-flash-preview'.
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction: "You are a helpful tax professional assistant. Provide clear, accurate general tax information.",
      }
    });
    // Extracting text from the response object property.
    return response.text || "I couldn't generate a response.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "I'm sorry, I'm having trouble connecting to the service right now.";
  }
};
