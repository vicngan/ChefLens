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
        if (message.type === "tool_call" && message.data.name === "update_recipe_state") {
          setCurrentStep({
            number: message.data.args.stepNumber,
            description: message.data.args.stepDescription
          });
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
    <main className="flex h-screen w-full flex-col items-center justify-center bg-zinc-950 text-white p-4">
      <div className="absolute top-4 left-4 z-10 flex items-center gap-4">
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
      </div>
      
      <p className="mt-8 text-zinc-500 max-w-lg text-center text-sm">
        Place your ingredients in front of the camera and simply say <br/>
        <span className="text-zinc-300">&quot;What can I cook with this?&quot;</span>
      </p>
    </main>
  );
}
