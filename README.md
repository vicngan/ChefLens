# 🍳 ChefLens

ChefLens is an intelligent, hands-free AI Cooking Copilot powered by the Gemini 2.0 Multimodal Live API. It watches you cook through your webcam and guides you step-by-step using real-time voice and visual feedback.

ChefLens is designed to be highly accessible and deeply interactive, allowing anyone to cook confidently regardless of skill level or physical ability.

---

## 🏗️ Architecture Plan

The project uses a split Client-Server architecture to securely connect the frontend Next.js app to Google's Gemini Models.

1. **Frontend (Next.js & React)**
   - **`react-webcam`**: Captures real-time camera frames and passes them to the backend at 1 FPS.
   - **`WebSocket Client`**: Streams video, receives audio buffers for playback, receives system tool calls (like UI updates), and Closed Captions.
   - **`MediaRecorder`**: Captures the webcam video and audio tracks locally so users can download their sessions.

2. **Backend (Node.js & Express & WebSocket)**
   - **`@google/genai`**: Manages the WebRTC/WebSocket stateful connection to the `gemini-2.0-flash-exp` model in real-time.
   - **`WebSocket Server` (`ws`)**: Acts as a bridge between the Frontend and Gemini. Forwards `pixelData` and `audio` to Gemini, and relays responses back to the client.
   - **System Instruction Engineering**: A strict system prompt dictates Gemini's persona as a cooking assistant, directing it to check for mistakes, keep responses short, and respect our distinct accessibility constraints.

---

## ✨ Features & Implementation

### 1. 🎤 Live Voice & Vision Copilot
- **Implementation**: The backend establishes a Live API Session with Gemini. The frontend sends continuous `image/jpeg` base64 strings and `audio/pcm` data. Gemini responds with spoken audio and JSON-based Tool Calls (e.g., `update_recipe_state`) to advance the on-screen steps. 

### 2. 🔴 Session Recording & Download
- **Implementation**: Using the native browser `MediaRecorder` API, the user can start and stop recording their cooking session natively in the browser. It combines both the video track and the un-muted microphone audio track into a `Blob`, allowing immediate download as a `.webm` file.

### 3. 🦻 Accessibility: Closed Captions (CC)
- **Implementation**: We request both `AUDIO` and `TEXT` output from Gemini. The backend intercepts the transcription text and broadcasts it as `type: "cc"` to the frontend, which renders it as a floating subtitle overlay on the video feed.

### 4. 🧏 Accessibility: Sign Language & Vision AI 
- **Implementation**: For vocal-compromised users, ChefLens acts as a sign language interpreter. Because we stream video frames directly to the model, and instruct Gemini to look for American Sign Language (ASL) via the System Prompt ("ACCESSIBILITY OVERRIDE"), users can simply sign to the camera. Gemini natively understands the gestures and responds aloud.

---

## 🚀 Tutorial: How to set up and run Locally

This repository is split between `./frontend` and `./backend`. You will need to run both to use the app.

### Prerequisites
- Node.js (v20+)
- A Google Gemini API Key. You can get yours from [Google AI Studio](https://aistudio.google.com/apikey).

### 1. Setup the Backend
The backend serves as a secure bridge to Gemini via WebSockets, ensuring your API key is never exposed to the client.

1. Open a terminal and navigate to the `backend` folder:
   ```bash
   cd backend
   npm install
   ```
2. Create a `.env` file in the `backend` folder and add your Gemini API Key:
   ```env
   GEMINI_API_KEY=your_actual_key_here
   ```
3. Start the backend WebSockets server (it will run on Port `3001`):
   ```bash
   npm run dev
   ```

### 2. Setup the Frontend
The frontend provides the interactive UI, manages webcam streams, and records the interaction.

1. Open a new terminal tab/window and navigate to the `frontend` folder:
   ```bash
   cd frontend
   npm install
   ```
2. Start the development server (Defaults to Port `3000`):
   ```bash
   npm run dev
   ```
3. Open your browser and go to [http://localhost:3000](http://localhost:3000)

### 3. How to use ChefLens
- **Start Cooking:** Ensure your webcam and microphone permissions are accepted in the browser. Place an ingredient in front of the camera and ask, "What can I make with this?".
- **Record Your Session:** Click the "Start Recording" button to record yourself cooking. Click "Stop" when done to instantly download the `.webm` video.
- **Toggle CC:** Click the "CC" button in the top right to turn live captions on or off (great for noisy kitchens!).
- **Sign Language Mode:** If you or a participant are vocal-compromised, simply sign your instructions or questions to the camera—ChefLens is watching via vision AI and will answer!

---

## ☁️ Deployment Guide

### Deploying the Backend
The Node.js backend can be deployed to any service that supports WebSockets and long-running Node applications (e.g., Render, Railway, DigitalOcean App Platform, Google Cloud Run).

1. Ensure the hosting platform allows WebSocket connections (`ws://` or `wss://`).
2. Add your `GEMINI_API_KEY` to the Environment Variables settings in your hosting provider's dashboard.
3. Once deployed, note the remote URL (e.g. `wss://cheflens-backend.onrender.com`).

### Deploying the Frontend
The Next.js frontend is best deployed to Vercel.

1. Create a project on [Vercel](https://vercel.com) and link your GitHub repository.
2. Ensure the "Root Directory" is set to `frontend/` so Vercel knows where Next.js lives.
3. Provide the production WebSocket URL for your backend to the frontend (you may need to configure `page.tsx` or an `.env.local` to switch between `ws://localhost:3001` locally and the `wss://` production server).
4. Deploy the frontend and visit your live domain!
