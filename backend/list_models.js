import dotenv from 'dotenv';
dotenv.config();
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function run() {
    try {
        const response = await ai.models.list();
        console.log(JSON.stringify(response, null, 2));
    } catch(err) {
        console.error("Error", err);
    }
}
run();
