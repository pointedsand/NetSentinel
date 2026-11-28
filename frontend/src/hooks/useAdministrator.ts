import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

type Status = { enabled:boolean; unlocked:boolean; unavailable:boolean; expiresAt:number|null };
type Reply = Status & { type:string; token?:string; challenge?:string; requestId?:number; message?:string; setupFile?:string; setupVerifiedUntil?:number };
const protectedCommands = new Set(['monitor_rules','device_preference','clear_packets','clear_events','active_dns']);

export function useAdministrator(socket:RefObject<WebSocket|null>) {
  const [status,setStatus] = useState<Status|null>(null);
  const [dialog,showDialog] = useState(false);
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const [setupFile,setSetupFile] = useState('');
  const [setupVerification,setSetupVerification] = useState<{requestId:number; until:number}>();
  const token = useRef<string | undefined>(undefined);
  const challenge = useRef<string | undefined>(undefined);
  const serial = useRef(0);
  const lastActivity = useRef(0);
  const action = useRef(0);
  const request = useRef(0);

  const send = useCallback((command:string,fields:object={})=>{
    if (socket.current?.readyState !== WebSocket.OPEN) return false;
    socket.current.send(JSON.stringify({type:'control',command,...fields}));
    return true;
  },[socket]);
  const command = useCallback((name:string,fields:object={})=>{
    if (!protectedCommands.has(name)) return send(name,fields);
    action.current = ++serial.current;
    return send(name,{...fields,token:token.current,requestId:action.current});
  },[send]);
  const cancel = useCallback(()=>{
    challenge.current = undefined;
    request.current = 0;
    action.current = 0;
    showDialog(false); setError(''); setBusy(false);
  },[]);
  const reset = useCallback(()=>{
    cancel(); token.current = undefined; setStatus(null); setSetupFile(''); setSetupVerification(undefined);
  },[cancel]);
  const manage = useCallback((name:string,fields:object={})=>{
    request.current = ++serial.current;
    setError('');
    if (send(name,{...fields,requestId:request.current})) {
      setBusy(true);
      return request.current;
    }
    setError('Connect to the local bridge to continue.');
    return 0;
  },[send]);
  const receive = useCallback((data:Reply)=>{
    if (data.type === 'admin_required') {
      if (data.requestId === action.current) {
        token.current = undefined;
        challenge.current = data.challenge;
        setStatus(s=>s && {...s,unlocked:false,expiresAt:null});
        setError(''); showDialog(true);
      }
      return true;
    }
    if (data.type !== 'admin_error' && data.type !== 'admin_status') return false;
    const current = !data.requestId || data.requestId === request.current;
    if (data.type === 'admin_error') {
      if (!current) return true;
      setBusy(false); setError(data.message || 'Administrator request failed.'); return true;
    }
    setStatus({enabled:data.enabled,unavailable:data.unavailable,unlocked:data.unlocked && Boolean(token.current || (current && data.token)),expiresAt:data.expiresAt});
    if (!data.unlocked) token.current = undefined;
    if (current && data.requestId) {
      setBusy(false); setSetupFile(data.setupFile || '');
      setSetupVerification(data.setupVerifiedUntil ? {requestId:data.requestId,until:data.setupVerifiedUntil} : undefined);
      if (data.token) {
        token.current = data.token;
        if (challenge.current) send('admin_resume',{challenge:challenge.current,token:data.token});
        cancel();
      }
    }
    return true;
  },[cancel,send]);
  useEffect(()=>{
    if (!status?.unlocked || !status.expiresAt) return;
    const timer = setTimeout(()=>send('admin_status'),Math.max(0,status.expiresAt-Date.now())+50);
    const activity = (e:Event)=>{
      if (e.isTrusted && token.current && Date.now()-lastActivity.current>30_000) {
        lastActivity.current=Date.now(); send('admin_activity',{token:token.current});
      }
    };
    window.addEventListener('pointerdown',activity);
    window.addEventListener('keydown',activity);
    return ()=>{clearTimeout(timer); window.removeEventListener('pointerdown',activity); window.removeEventListener('keydown',activity);};
  },[status?.expiresAt,status?.unlocked,send]);
  return {status,dialog,error,busy,setupFile,setupVerification,command,manage,cancel,reset,receive,
    unlock:()=>{cancel();showDialog(true);}};
}
export type AdminControls = ReturnType<typeof useAdministrator>;
