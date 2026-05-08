import React, { useRef, useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, doc, setDoc, addDoc, onSnapshot, getDoc, updateDoc } from 'firebase/firestore';
import { encryptText, decryptText } from '../utils/encryption';
import { motion } from 'motion/react';
import { Video, VideoOff, Mic, MicOff, PhoneOff, Loader2 } from 'lucide-react';
import { User } from 'firebase/auth';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';

export default function VideoCallModal({ roomId, user, onClose }: { roomId: string, user: User, onClose: () => void }) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [hasVideo, setHasVideo] = useState(true);
  const [hasAudio, setHasAudio] = useState(true);
  const [callStatus, setCallStatus] = useState<string>('Initializing...');
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnection = useRef<RTCPeerConnection | null>(null);

  const servers = {
    iceServers: [
      { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }
    ]
  };

  useEffect(() => {
    let unsubs: (() => void)[] = [];

    const initCall = async () => {
      setCallStatus('Requesting permissions...');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setLocalStream(stream);
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        
        setupPeerConnection(stream);
      } catch (err) {
        setCallStatus('Permissions denied or no device found.');
      }
    };

    const setupPeerConnection = async (stream: MediaStream) => {
      pc.current = new RTCPeerConnection(servers);
      peerConnection.current = pc.current;

      stream.getTracks().forEach(track => pc.current?.addTrack(track, stream));

      pc.current.ontrack = (event) => {
        setRemoteStream(event.streams[0]);
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0];
      };

      const callDocRef = doc(db, 'rooms', roomId, 'call', 'active');
      const offerCandidates = collection(db, 'rooms', roomId, 'call', 'active', 'offerCandidates');
      const answerCandidates = collection(db, 'rooms', roomId, 'call', 'active', 'answerCandidates');

      pc.current.onicecandidate = (event) => {
        if (event.candidate) {
          const cipherCandidate = encryptText(JSON.stringify(event.candidate.toJSON()));
          if (callStatus === 'Calling...') {
             addDoc(offerCandidates, { candidate: cipherCandidate }).catch(e => handleFirestoreError(e, OperationType.CREATE, 'offerCandidates'));
          } else {
             addDoc(answerCandidates, { candidate: cipherCandidate }).catch(e => handleFirestoreError(e, OperationType.CREATE, 'answerCandidates'));
          }
        }
      };

      const callDocSnap = await getDoc(callDocRef);
      if (!callDocSnap.exists() || Date.now() - (callDocSnap.data()?.updatedAt || 0) > 60000) {
        // We are the caller
        setCallStatus('Calling...');
        const offerDescription = await pc.current.createOffer();
        await pc.current.setLocalDescription(offerDescription);
        
        const cipherOffer = encryptText(JSON.stringify({ type: offerDescription.type, sdp: offerDescription.sdp }));
        await setDoc(callDocRef, { offer: cipherOffer, updatedAt: Date.now() });

        // Listen for answer
        unsubs.push(onSnapshot(callDocRef, (snapshot) => {
           const data = snapshot.data();
           if (data?.answer && !pc.current?.currentRemoteDescription) {
             try {
                const plainAnswer = JSON.parse(decryptText(data.answer));
                const answerDescription = new RTCSessionDescription(plainAnswer);
                pc.current?.setRemoteDescription(answerDescription);
                setCallStatus('Connected (E2EE)');
             } catch(e) {}
           }
        }));

        // Listen for remote ICE candidates
        unsubs.push(onSnapshot(answerCandidates, (snapshot) => {
           snapshot.docChanges().forEach((change) => {
             if (change.type === 'added') {
               try {
                  const candidate = new RTCIceCandidate(JSON.parse(decryptText(change.doc.data().candidate)));
                  pc.current?.addIceCandidate(candidate);
               } catch(e) {}
             }
           });
        }));

      } else {
        // We are the answerer
        setCallStatus('Joining...');
        try {
           const plainOffer = JSON.parse(decryptText(callDocSnap.data().offer));
           const offerDescription = new RTCSessionDescription(plainOffer);
           await pc.current.setRemoteDescription(offerDescription);

           const answerDescription = await pc.current.createAnswer();
           await pc.current.setLocalDescription(answerDescription);

           const cipherAnswer = encryptText(JSON.stringify({ type: answerDescription.type, sdp: answerDescription.sdp }));
           await updateDoc(callDocRef, { answer: cipherAnswer, updatedAt: Date.now() });
           setCallStatus('Connected (E2EE)');
        } catch(e) {
           setCallStatus('Failed to decrypt call offer.');
        }

        // Listen for remote ICE candidates
        unsubs.push(onSnapshot(offerCandidates, (snapshot) => {
           snapshot.docChanges().forEach((change) => {
             if (change.type === 'added') {
               try {
                  const candidate = new RTCIceCandidate(JSON.parse(decryptText(change.doc.data().candidate)));
                  pc.current?.addIceCandidate(candidate);
               } catch(e) {}
             }
           });
        }));
      }
    };

    let pc: { current: RTCPeerConnection | null } = { current: null };
    initCall();

    return () => {
      unsubs.forEach(unsub => unsub());
      localStream?.getTracks().forEach(track => track.stop());
      if (pc.current) pc.current.close();
    };
  }, [roomId]);

  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => {
        track.enabled = !hasVideo;
      });
      setHasVideo(!hasVideo);
    }
  };

  const toggleAudio = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !hasAudio;
      });
      setHasAudio(!hasAudio);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-5xl h-[80vh] bg-slate-900 rounded-3xl overflow-hidden shadow-2xl border border-slate-800 flex flex-col relative">
        {/* Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between z-10 bg-slate-900/50 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-brand-accent/20 flex items-center justify-center">
              <Video className="w-5 h-5 text-brand-accent" />
            </div>
            <div>
              <h3 className="text-white font-bold text-lg">Secure Video Call</h3>
              <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">{callStatus}</p>
            </div>
          </div>
        </div>

        {/* Video Area */}
        <div className="flex-1 relative flex bg-black p-2 gap-2">
          {/* Main Remote Video */}
          <div className="flex-1 rounded-2xl overflow-hidden relative bg-slate-900 border border-slate-800 shadow-inner flex items-center justify-center">
            {remoteStream ? (
              <video 
                ref={remoteVideoRef} 
                className="w-full h-full object-cover" 
                autoPlay 
                playsInline 
              />
            ) : (
              <div className="flex flex-col items-center justify-center opacity-50">
                <Loader2 className="w-12 h-12 text-slate-400 animate-spin mb-4" />
                <span className="text-slate-400 font-medium">Waiting for others to join...</span>
              </div>
            )}
          </div>
          
          {/* PiP Local Video */}
          <div className="absolute top-6 right-6 w-48 h-72 bg-slate-800 rounded-xl overflow-hidden border-2 border-slate-700 shadow-2xl z-20">
            <video 
              ref={localVideoRef} 
              className="w-full h-full object-cover" 
              autoPlay 
              playsInline 
              muted 
            />
            {(!hasVideo || !hasAudio) && (
              <div className="absolute bottom-2 left-2 flex gap-1">
                {!hasVideo && <div className="p-1 bg-red-500 rounded-lg"><VideoOff className="w-3 h-3 text-white" /></div>}
                {!hasAudio && <div className="p-1 bg-red-500 rounded-lg"><MicOff className="w-3 h-3 text-white" /></div>}
              </div>
            )}
            <div className="absolute top-2 left-2 px-2 py-1 bg-black/50 backdrop-blur rounded text-[10px] text-white font-bold">You</div>
          </div>
        </div>

        {/* Controls */}
        <div className="p-6 bg-slate-900/80 border-t border-white/5 flex items-center justify-center gap-4 z-10 backdrop-blur-md">
          <button 
            onClick={toggleAudio}
            className={`p-4 rounded-full transition-all shadow-lg ${hasAudio ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-red-500 hover:bg-red-600 text-white'}`}
          >
            {hasAudio ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
          </button>
          
          <button 
            onClick={onClose}
            className="px-8 py-4 bg-red-500 hover:bg-red-600 text-white rounded-full font-bold shadow-lg shadow-red-500/20 hover:scale-105 transition-all flex items-center gap-2"
          >
            <PhoneOff className="w-5 h-5" /> Leave Call
          </button>

          <button 
            onClick={toggleVideo}
            className={`p-4 rounded-full transition-all shadow-lg ${hasVideo ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-red-500 hover:bg-red-600 text-white'}`}
          >
            {hasVideo ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
