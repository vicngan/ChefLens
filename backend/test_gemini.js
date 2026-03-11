import dotenv from 'dotenv';
dotenv.config();
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function run() {
    try {
        console.log("Connecting...");
        let responseReceived = false;
        const session = await ai.live.connect({
            model: "gemini-2.5-flash-native-audio-latest",
            config: {
                systemInstruction: { parts: [{ text: "You are a helpful assistant." }] },
                responseModalities: ["TEXT"]
            },
            callbacks: {
                onmessage: (msg) => {
                    console.log("Got message from Gemini", JSON.stringify(msg, null, 2));
                    responseReceived = true;
                },
                onerror: (err) => {
                    console.log("Gemini Error:", err);
                },
                onclose: (e) => {
                    console.log("Gemini Closed:", e);
                }
            }
        });

        console.log("Sending initial frame...");
        const emptyImage = Buffer.alloc(1024, 0).toString('base64');
        session.sendRealtimeInput([{
            mimeType: "image/jpeg",
            data: emptyImage
        }]);

        setTimeout(() => {
            console.log("Sending text to Gemini...");
            try {
                session.sendClientContent({
                    turns: [{ role: "user", parts: [{ text: "Hello! Do you see this blank image?" }] }],
                    turnComplete: true
                });
            } catch(e) { console.error("Text failed"); }
        }, 2000);

        setTimeout(() => {
            console.log("Done waiting");
            process.exit(0);
        }, 10000);
    } catch(err) {
        console.error("Error connecting", err);
    }
}
run();
