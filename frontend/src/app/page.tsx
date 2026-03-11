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
  const [inputMode, setInputMode] = useState<"camera" | "text">("camera");
  const [inputText, setInputText] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [isThinking, setIsThinking] = useState(false);

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
      // Only capture if webcam is actually rendered and streaming
      if (webcamRef.current && inputMode === "camera") {
        const imageSrc = webcamRef.current.getScreenshot();
        if (imageSrc) {
          const base64 = imageSrc.split(",")[1];
          ws.send(JSON.stringify({ type: "pixelData", base64 }));
        }
      }
    }, 1000); // 1 frame per second

    return () => clearInterval(interval);
  }, [ws, isConnected, inputMode]);

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

        {/* Mode Toggle UI */}
        <div className="flex p-1 bg-zinc-900 border border-zinc-800 rounded-full shadow-lg">
            <button
                onClick={() => setInputMode("camera")}
                className={`flex items-center gap-2 px-6 py-2 rounded-full text-sm font-semibold transition-all ${inputMode === "camera" ? "bg-zinc-800 text-white shadow-md border border-zinc-700" : "text-zinc-500 hover:text-zinc-300"}`}
            >
                📸 Camera
            </button>
            <button
                onClick={() => setInputMode("text")}
                className={`flex items-center gap-2 px-6 py-2 rounded-full text-sm font-semibold transition-all ${inputMode === "text" ? "bg-zinc-800 text-white shadow-md border border-zinc-700" : "text-zinc-500 hover:text-zinc-300"}`}
            >
                ⌨️ Text
            </button>
        </div>
      </div>

      {inputMode === "camera" ? (
      <div className="relative w-full max-w-4xl aspect-video rounded-2xl overflow-hidden border border-zinc-800 shadow-2xl">
        <Webcam
          ref={webcamRef}
          audio={true}
          muted={true} // Prevent audio feedback from default webcam mic
          screenshotFormat="image/jpeg"
          className="w-full h-full object-cover"
        />
        
        {/* Visualizer Overlay */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
           <div className="w-32 h-32 rounded-full border-4 border-blue-500/30 animate-[ping_3s_ease-in-out_infinite]"></div>
           <div className="absolute w-24 h-24 rounded-full bg-blue-500/20 shadow-[0_0_50px_rgba(59,130,246,0.5)] backdrop-blur-md"></div>
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
        {/* Closed Captions Overlay */}
        {captionsEnabled && captionsText && (
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 w-10/12 text-center pointer-events-none z-20 transition-opacity duration-300">
            <span className="bg-black/80 px-4 py-2 rounded-lg text-yellow-400 font-bold text-lg md:text-xl drop-shadow-md">
                {captionsText}
            </span>
          </div>
        )}

        {/* Controls Overlay */}
        <div className="absolute top-4 right-4 flex flex-col items-end gap-2 z-10">
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
      ) : (
      // TEXT MODE UI
      <div className="flex-1 w-full max-w-4xl flex flex-col items-center justify-center animate-in fade-in">
          <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-2xl shadow-xl w-full text-center">
            <h1 className="text-3xl font-light text-white mb-2">What&apos;s in your kitchen?</h1>
            <p className="text-zinc-400 mb-8">Type out your ingredients, dietary restrictions, or cooking questions below.</p>
            
            <form onSubmit={handleTextSubmit} className="flex gap-2 w-full max-w-2xl mx-auto">
                <input 
                    type="text" 
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="e.g. I have 2 eggs, flour, and some spinach..." 
                    autoFocus
                    className="flex-1 bg-zinc-950 border border-zinc-700 text-white placeholder-zinc-500 px-6 py-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-lg shadow-inner"
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
      </div>
      )}
      
      {inputMode === "camera" && (
      <div className="mt-8 w-full max-w-lg mb-4 animate-in fade-in">
        {/* Quick Actions */}
        <div className="flex flex-col items-center justify-center gap-3">
            <button
                onClick={handleQuickAction}
                disabled={!isConnected}
                className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-blue-400 text-sm font-medium px-6 py-3 rounded-full border border-blue-900/50 transition-colors flex items-center gap-2 shadow-lg"
            >
                📷 Identify ingredients on camera
            </button>
        </div>
      </div>
      )}
      
    </main>
  );
}
