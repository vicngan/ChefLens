"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Webcam from "react-webcam";

export default function ChefLensHome() {
  const webcamRef = useRef<Webcam>(null);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [currentStep, setCurrentStep] = useState({ number: 0, description: "Waiting for ingredients..." });

  // Recording State
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  
  const handleDataAvailable = useCallback(
    ({ data }: BlobEvent) => {
      if (data.size > 0) {
        setRecordedChunks((prev) => prev.concat(data));
      }
    },
    [setRecordedChunks]
  );

  const startRecording = useCallback(() => {
    if (webcamRef.current && webcamRef.current.stream) {
      setRecordedChunks([]);
      
      const stream = webcamRef.current.stream;
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "video/webm;codecs=vp9,opus"
      });
      
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.addEventListener("dataavailable", handleDataAvailable);
      mediaRecorder.start();
      setIsRecording(true);
    }
  }, [webcamRef, handleDataAvailable]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [mediaRecorderRef]);

  const downloadRecording = useCallback(() => {
    if (recordedChunks.length) {
      const blob = new Blob(recordedChunks, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      document.body.appendChild(a);
      a.style.display = "none";
      a.href = url;
      a.download = `cheflens-session-${new Date().getTime()}.webm`;
      a.click();
      window.URL.revokeObjectURL(url);
      setRecordedChunks([]); // Clear chunks after download
    }
  }, [recordedChunks]);

  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [captionsText, setCaptionsText] = useState("");
  const captionsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Visual Guidance State
  const [visualGuidance, setVisualGuidance] = useState<{ active: boolean; query: string; url: string | null }>({ active: false, query: "", url: null });

  // Input & Query State
  const [inputText, setInputText] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [showCamera, setShowCamera] = useState(true);

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !ws || !isConnected) return;
    
    // Set query and loading state
    setActiveQuery(inputText.trim());
    setIsThinking(true);

    ws.send(JSON.stringify({ type: "clientContent", text: inputText }));
    setInputText("");
  };

  const handleQuickAction = () => {
    if (!ws || !isConnected) return;
    const query = "What ingredients am I holding and what can I cook with them?";
    setActiveQuery(query);
    setIsThinking(true);
    ws.send(JSON.stringify({ type: "clientContent", text: query }));
  };

  useEffect(() => {
    // Connect to Backend WebSocket
    const socket = new WebSocket("ws://localhost:3001");
    
    socket.onopen = () => {
      console.log("Connected to ChefLens Backend");
      setIsConnected(true);
      setWs(socket);
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        // Any incoming message means Gemini has started responding!
        if (message.type === "cc" || message.type === "audio" || message.type === "tool_call") {
             setIsThinking(false);
        }

        if (message.type === "tool_call" && message.data.name === "update_recipe_state") {
          setCurrentStep({
            number: message.data.args.stepNumber,
            description: message.data.args.stepDescription
          });
        }

        if (message.type === "tool_call" && message.data.name === "show_ingredient_visual") {
          const query = message.data.args.searchQuery;
          setVisualGuidance({ active: true, query, url: null });
          
          const apiKey = process.env.NEXT_PUBLIC_GIPHY_API_KEY || 'pLURtkhVrGQm3MntqKPdCX4OO0VK4Mcm';
          fetch(`https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(query + " cooking")}&limit=1&rating=pg`)
            .then(res => res.json())
            .then(data => {
                if (data.data && data.data.length > 0) {
                    setVisualGuidance({ active: true, query, url: data.data[0].images.original.url });
                }
            })
            .catch(err => console.error("Giphy fetch error", err));
        }
        
        if (message.type === "cc") {
          setCaptionsText((prev) => prev + message.text);
          
          if (captionsTimeoutRef.current) {
             clearTimeout(captionsTimeoutRef.current);
          }
          // Clear captions if silent for 3 seconds
          captionsTimeoutRef.current = setTimeout(() => {
             setCaptionsText("");
          }, 3000);
        }
        
        // audio playback logic would go here
      } catch (err) {
        console.error("Failed to parse message", err);
      }
    };

    socket.onclose = () => setIsConnected(false);

    return () => socket.close();
  }, []);

  // Frame streaming effect
  useEffect(() => {
    if (!ws || !isConnected) return;

    const interval = setInterval(() => {
      // Always capture if webcam is connected (even if hidden via CSS) so the AI can still 'see' the room
      if (webcamRef.current) {
        const imageSrc = webcamRef.current.getScreenshot();
        if (imageSrc) {
          const base64 = imageSrc.split(",")[1];
          ws.send(JSON.stringify({ type: "pixelData", base64 }));
        }
      }
    }, 1000); // 1 frame per second

    return () => clearInterval(interval);
  }, [ws, isConnected]);

  return (
    <main className="flex h-screen w-full flex-col items-center justify-start bg-zinc-950 text-white p-4 pt-8">
      
      {/* Top Status & Mode Toggle */}
      <div className="w-full max-w-4xl flex items-center justify-between z-10 mb-6">
        <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`}></div>
                <span className="text-sm font-medium tracking-wide">
                {isConnected ? "LIVE API CONNECTED" : "CONNECTING..."}
                </span>
            </div>
            
            {isRecording && (
                <div className="flex items-center gap-2 bg-black/40 px-3 py-1 rounded-full backdrop-blur-md border border-red-500/30">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></div>
                    <span className="text-xs font-bold text-red-500 tracking-wider">REC</span>
                </div>
            )}
        </div>

        {/* Mode Toggle UI & Status */}
        <div className="flex p-1 bg-zinc-900 border border-zinc-800 rounded-full shadow-lg">
            <button
                onClick={() => setShowCamera(!showCamera)}
                className={`flex items-center gap-2 px-6 py-2 rounded-full text-sm font-semibold transition-all ${showCamera ? "bg-zinc-800 text-white shadow-md border border-zinc-700" : "text-zinc-500 hover:text-zinc-300"}`}
            >
                {showCamera ? "🫣 Hide Camera" : "📸 Show Camera"}
            </button>
        </div>
      </div>

      <div className="relative w-full max-w-4xl aspect-video rounded-3xl overflow-hidden bg-black shadow-2xl flex items-center justify-center border border-zinc-800/50">
        
        {/* Main Centerpiece: The Visualizer Orbs */}
        <div className="relative flex items-center justify-center w-full h-full pointer-events-none">
            {/* Outer large pulse */}
            <div className={`w-64 h-64 rounded-full border border-blue-500/20 ${isThinking ? 'animate-[ping_1.5s_ease-in-out_infinite] border-green-500/40' : 'animate-[ping_4s_ease-in-out_infinite]'}`}></div>
            {/* Medium subtle glow */}
            <div className={`absolute w-48 h-48 rounded-full shadow-[0_0_80px_rgba(59,130,246,0.3)] backdrop-blur-3xl ${isThinking ? 'bg-green-500/10 shadow-[0_0_100px_rgba(34,197,94,0.4)] animate-pulse' : 'bg-blue-500/10'}`}></div>
            {/* Inner bright core */}
            <div className={`absolute w-24 h-24 rounded-full shadow-[0_0_50px_rgba(255,255,255,0.4)] ${isThinking ? 'bg-green-400/50 animate-bounce' : 'bg-blue-500/30'}`}></div>
            
            {/* Copilot Status Text */}
            <div className="absolute -bottom-20 text-center">
                <span className="text-zinc-500 text-sm tracking-widest uppercase font-semibold">
                    {isThinking ? "ChefLens is thinking..." : "ChefLens is listening"}
                </span>
            </div>
        </div>

        {/* Picture-in-Picture Webcam (Top Right) */}
        <div className={`absolute top-4 right-4 w-48 aspect-video bg-zinc-900 rounded-xl overflow-hidden border-2 border-zinc-700 shadow-2xl transition-all duration-500 ${showCamera ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}>
            <Webcam
                ref={webcamRef}
                audio={true}
                muted={true} // Prevent audio feedback from default webcam mic
                screenshotFormat="image/jpeg"
                className="w-full h-full object-cover"
            />
        </div>

        {/* Recipe Step Overlay */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-11/12 max-w-2xl bg-black/60 backdrop-blur-lg border border-white/10 p-6 rounded-2xl text-center">
          <h2 className="text-blue-400 font-semibold tracking-widest text-sm mb-2">
            STEP {currentStep.number}
          </h2>
          <p className="text-xl md:text-2xl font-light text-white">
            {currentStep.description}
          </p>
        </div>
        {/* Closed Captions Overlay - Moved up slightly to not overlap recipe */}
        {captionsEnabled && captionsText && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 w-10/12 text-center pointer-events-none z-20 transition-opacity duration-300">
            <span className="bg-black/80 px-4 py-2 rounded-lg text-yellow-400 font-bold text-lg md:text-xl drop-shadow-md">
                {captionsText}
            </span>
          </div>
        )}

        {/* Top Left Controls Overlay (Moved from right due to PiP camera) */}
        <div className="absolute top-4 left-4 flex flex-col items-start gap-2 z-10">
            <button
                onClick={() => setCaptionsEnabled(!captionsEnabled)}
                className={`text-sm font-semibold px-4 py-2 rounded-full backdrop-blur-md transition-colors shadow-lg border ${captionsEnabled ? 'bg-zinc-800 text-white border-zinc-500' : 'bg-zinc-800/50 text-zinc-400 border-zinc-700 hover:bg-zinc-700'}`}
            >
                CC
            </button>
            {!isRecording ? (
                <button 
                  onClick={startRecording}
                  className="bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-2 rounded-full transition-colors flex items-center gap-2 shadow-lg"
                >
                  <div className="w-2.5 h-2.5 rounded-full bg-white"></div>
                  Start Recording
                </button>
            ) : (
                <button 
                  onClick={stopRecording}
                  className="bg-zinc-800/80 hover:bg-zinc-700 text-white text-sm font-semibold px-4 py-2 rounded-full backdrop-blur-md transition-colors flex items-center gap-2 border border-zinc-600 shadow-lg"
                >
                  <div className="w-3 h-3 bg-red-500 rounded-[2px]"></div>
                  Stop Recording
                </button>
            )}
            
            {!isRecording && recordedChunks.length > 0 && (
                <button 
                  onClick={downloadRecording}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-full transition-colors shadow-lg animate-in fade-in slide-in-from-top-2"
                >
                  ↓ Download Session
                </button>
            )}
        </div>

        {/* Visual Guidance Overlay */}
        {visualGuidance.active && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in">
                <div className="relative bg-zinc-900 border border-zinc-700 p-4 rounded-xl shadow-2xl max-w-sm w-full text-center">
                    <button 
                        onClick={() => setVisualGuidance({ active: false, query: "", url: null })}
                        className="absolute top-2 right-2 text-zinc-400 hover:text-white"
                    >
                        ✕
                    </button>
                    <h3 className="text-blue-400 font-semibold mb-3 capitalize">{visualGuidance.query}</h3>
                    {visualGuidance.url ? (
                        <img src={visualGuidance.url} alt={visualGuidance.query} className="w-full rounded-lg" />
                    ) : (
                        <div className="w-full h-48 bg-zinc-800 rounded-lg flex items-center justify-center animate-pulse">
                            <span className="text-zinc-500 text-sm">Loading Visual...</span>
                        </div>
                    )}
                </div>
            </div>
        )}

        {/* Active Query Overlay */}
        {activeQuery && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 bg-zinc-900/90 border border-zinc-700 backdrop-blur-md px-5 py-3 rounded-full shadow-lg max-w-md w-full animate-in slide-in-from-top-4">
                <div className="flex-1 truncate">
                    <span className="text-zinc-400 text-xs font-semibold tracking-wider uppercase block mb-0.5">You asked</span>
                    <span className="text-white text-sm font-medium">{activeQuery}</span>
                </div>
                {isThinking && (
                    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin shrink-0"></div>
                )}
            </div>
        )}
      </div>

      {/* Persistent Input & Actions Footer */}
      <div className="mt-6 w-full max-w-4xl flex flex-col md:flex-row items-center gap-4 animate-in fade-in">
        {/* Quick Actions */}
        <button
            onClick={handleQuickAction}
            disabled={!isConnected}
            className="w-full md:w-auto bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-blue-400 text-sm font-medium px-6 py-4 rounded-xl border border-blue-900/50 transition-colors flex items-center justify-center gap-2 shadow-lg whitespace-nowrap"
        >
            📷 Identify items
        </button>

        {/* Text Input */}
        <form onSubmit={handleTextSubmit} className="flex gap-2 w-full flex-1">
            <input 
                type="text" 
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Type your ingredients or ask a question..." 
                className="flex-1 bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-500 px-6 py-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 shadow-inner"
            />
            <button 
                type="submit" 
                disabled={!inputText.trim() || !isConnected}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-semibold px-8 py-4 rounded-xl transition-colors shadow-lg"
            >
                Send
            </button>
        </form>
      </div>

    </main>
  );
}
