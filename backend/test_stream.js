import dotenv from 'dotenv';
dotenv.config();
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SYSTEM_INSTRUCTION = "You are a test assistant.";

async function run() {
    try {
        console.log("Generating stream...");
        const responseStream = await ai.models.generateContentStream({
            model: 'gemini-2.5-flash',
            contents: [{ role: 'user', parts: [{ text: 'Hello!' }] }],
            config: {
                systemInstruction: SYSTEM_INSTRUCTION
            }
        });
        
        for await (const chunk of responseStream) {
            console.log("Chunk:", chunk.text);
        }
        console.log("Done.");
    } catch(err) {
        console.error("Error", err);
    }
}
run();
