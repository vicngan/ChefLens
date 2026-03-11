import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import cors from 'cors';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const server = createServer(app);
const wss = new WebSocketServer({ server });

// Initialize Gemini SDK
// Note: Requires GEMINI_API_KEY in .env
const ai = new GoogleGenAI({});

const SYSTEM_INSTRUCTION = `
You are ChefLens, an expert AI Cooking Copilot.
You guide users through cooking step-by-step using voice and by monitoring their video feed.
1. When asked about ingredients, look at the camera feed and suggest 2-3 recipes.
2. When guiding a recipe, go ONE step at a time.
3. Call the 'update_recipe_state' tool to update the user's screen when advancing to the next step.
4. If the user makes a mistake (e.g., grabs sugar instead of salt), interrupt them with a quick voice correction.
5. ACCESSIBILITY OVERRIDE: Some users are vocal-compromised and will communicate with you exclusively using American Sign Language (ASL). You MUST constantly monitor the video feed for hand signs and body language. If the user signs to you, interpret it natively and respond out loud with your voice (and text) to continue the conversation. Do not mention that you are interpreting sign language, just converse naturally.
6. VISUAL GUIDANCE: If the user asks what an ingredient looks like or how to perform a specific prep technique (e.g., "how do I dice this?", "how do I julienne?", "show me star anise"), you MUST call the 'show_ingredient_visual' tool with a highly descriptive search query for a GIF (e.g., 'dicing onion tutorial', 'julienne carrots', 'star anise'). Do this immediately alongside your verbal explanation.
Keep all voice responses brief and supportive.
`;

wss.on('connection', async (clientWs: WebSocket) => {
    console.log('Client connected to ChefLens Backend');

    try {
        let latestImageFrame: string | null = null;
        let latestImageMimeType: string | null = null;

        // Initialize Gemini Multimodal Live API connection
        const geminiLiveSession = await ai.live.connect({
            model: 'gemini-2.5-flash-native-audio-latest',
            config: {
                systemInstruction: SYSTEM_INSTRUCTION,
                tools: [{ 
                    functionDeclarations: [{
                        name: 'update_recipe_state',
                        description: 'Updates the visual UI with the current recipe step',
                        parameters: {
                            type: Type.OBJECT,
                            properties: {
                                stepNumber: { type: Type.NUMBER },
                                stepDescription: { type: Type.STRING }
                            },
                            required: ['stepNumber', 'stepDescription']
                        }
                    },
                    {
                        name: 'show_ingredient_visual',
                        description: 'Shows a visual animation or picture of an ingredient or a cooking technique on the user screen.',
                        parameters: {
                            type: Type.OBJECT,
                            properties: {
                                searchQuery: { 
                                    type: Type.STRING,
                                    description: "A highly descriptive search query for a GIF to demonstrate the technique or ingredient (e.g., 'dicing an onion', 'star anise spice')."
                                }
                            },
                            required: ['searchQuery']
                        }
                    }]
                }]
            },
            callbacks: {
                onmessage: (serverMessage: any) => {
                    // Receive data from Gemini and relay to Web Client
                    
                    // 1. Send Audio chunks
                    if (serverMessage.serverContent?.modelTurn?.parts) {
                        for (const part of serverMessage.serverContent.modelTurn.parts) {
                            if (part.inlineData && part.inlineData.mimeType.startsWith('audio/')) {
                                clientWs.send(JSON.stringify({ type: 'audio', base64: part.inlineData.data }));
                            }
                            
                            // 2. Send Text chunks (for Closed Captions)
                            if (part.text) {
                                clientWs.send(JSON.stringify({ type: 'cc', text: part.text }));
                            }
                        }
                    }
                    
                    // 3. Send Tool Calls
                    if (serverMessage.toolCall) {
                        clientWs.send(JSON.stringify({ type: 'tool_call', data: serverMessage.toolCall }));
                    }
                }
            }
        });

        // 1. Receive data from Web Client and relay to Gemini
        clientWs.on('message', async (message: Buffer) => {
            try {
                const data = JSON.parse(message.toString());
                
                // Route image frames
                if (data.type === 'pixelData') {
                    latestImageFrame = data.base64;
                    latestImageMimeType = 'image/jpeg';
                    geminiLiveSession.sendRealtimeInput({
                        media: { data: data.base64, mimeType: 'image/jpeg' }
                    });
                }
                
                // Route audio (PCM 16k)
                if (data.type === 'audio') {
                    geminiLiveSession.sendRealtimeInput({
                        media: { data: data.base64, mimeType: 'audio/pcm' }
                    });
                }
                
                // Route text input natively via out-of-band stream
                if (data.type === 'clientContent') {
                    try {
                        const parts: any[] = [];
                        if (latestImageFrame) {
                            parts.push({
                                inlineData: {
                                    data: latestImageFrame,
                                    mimeType: latestImageMimeType
                                }
                            });
                        }
                        parts.push({ text: data.text });
                        
                        const responseStream = await ai.models.generateContentStream({
                            model: 'gemini-2.5-flash',
                            contents: [{ role: 'user', parts: parts }] as any,
                            config: {
                                systemInstruction: SYSTEM_INSTRUCTION
                            }
                        });
                        
                        for await (const chunk of responseStream) {
                            if (chunk.text && clientWs.readyState === WebSocket.OPEN) {
                                clientWs.send(JSON.stringify({ type: 'cc', text: chunk.text }));
                            }
                        }
                    } catch (genErr) {
                        console.error('Error in out-of-band generation', genErr);
                    }
                }
            } catch (err) {
                console.error("Error processing client message", err);
            }
        });



        clientWs.on('close', () => {
            console.log('Client disconnected');
        });

    } catch (e) {
        console.error("Failed to connect to Gemini", e);
        clientWs.close();
    }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`ChefLens Backend running on http://localhost:${PORT}`);
});
