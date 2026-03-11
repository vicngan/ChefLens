# ChefLens Architecture Diagram

This diagram provides a high-level overview of how the ChefLens system operates, connecting the frontend client, the backend server, and the Google Gemini Multimodal Live API.

```mermaid
flowchart TD
    %% Define Styles
    classDef frontend fill:#E3F2FD,stroke:#1565C0,stroke-width:2px;
    classDef backend fill:#E8F5E9,stroke:#2E7D32,stroke-width:2px;
    classDef ai fill:#F3E5F5,stroke:#6A1B9A,stroke-width:2px;
    classDef db fill:#FFF3E0,stroke:#E65100,stroke-width:2px;

    %% Nodes
    subgraph Frontend [Next.js Client Site (Port 3000)]
        UI[User Interface & Controls]:::frontend
        Webcam[Webcam/Microphone]:::frontend
        Recorder[MediaRecorder Session]:::frontend
    end

    subgraph Backend [Node.js Server (Port 3001)]
        WS_Server[WebSocket Server]:::backend
        Auth[API Key Management]:::backend
        SDK[@google/genai SDK]:::backend
    end

    subgraph Google Cloud
        Gemini[Gemini 2.0 Multimodal Live API]:::ai
    end

    %% Optional Database if you add users/saved recipes later
    %% DB[(Supabase/PostgreSQL)]:::db

    %% Connections
    UI -- "Connects" --> WS_Server
    Webcam -- "base64 image/jpeg (1fps)" --> WS_Server
    Webcam -- "base64 audio/pcm" --> WS_Server
    UI -- "Toggles CC / Recording" --> Recorder
    
    WS_Server -- "sendRealtimeInput(media)" --> SDK
    Auth -- "Injects .env Key" --> SDK
    
    SDK -- "Secure Bi-directional WebRTC connection" --> Gemini
    
    Gemini -- "Audio Responses" --> SDK
    Gemini -- "Text Transcriptions (Captions)" --> SDK
    Gemini -- "JSON Tool Calls (UI Updates)" --> SDK
    
    SDK -- "Routes payloads" --> WS_Server
    
    WS_Server -- "Broadcasts 'audio', 'cc', 'tool_call' JSON" --> UI
    
    %% Optional Database Connections
    %% Backend -. "Fetches/Saves Data" .-> DB

```

### Component Breakdown
1. **Frontend**: Built with Next.js. Employs `react-webcam` to grab still images every second and PCM audio streams. It establishes a standard WebSocket (`ws://`) connection to the backend to stream data without exposing API keys. Native `MediaRecorder` runs locally to package the video track and unmuted audio track into a downloadable `.webm` file.
2. **Backend**: Built with Node.js and Express. It acts as an intermediary relay. It utilizes the `@google/genai` library (`1.44.0+`) to establish a persistent session with the Gemini Live API.
3. **Gemini Live API**: The core AI engine. It continuously receives multi-modal inputs (vision frames and voice) from the backend, evaluates the context against its strict System Prompt ("Sign Language Interpreter / Cooking Copilot"), and streams back live audio, live text transcriptions (Closed Captions), and tool calls dynamically as the user progresses.
