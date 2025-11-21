
import { Injectable } from '@angular/core';
import { GoogleGenAI, Chat, GenerateContentResponse } from '@google/genai';

@Injectable({
  providedIn: 'root',
})
export class GeminiService {
  private ai: GoogleGenAI | null = null;

  constructor() {
    const apiKey = process.env.API_KEY;
    if (apiKey) {
      this.ai = new GoogleGenAI({ apiKey });
    } else {
      console.error('API_KEY environment variable not set.');
    }
  }

  startChat(): Chat | null {
    if (!this.ai) return null;

    return this.ai.chats.create({
      model: 'gemini-2.5-flash',
      config: {
        systemInstruction: 'You are a helpful writing assistant.',
        thinkingConfig: { thinkingBudget: 0 }
      },
    });
  }
  
  isConfigured(): boolean {
    return this.ai !== null;
  }
}
