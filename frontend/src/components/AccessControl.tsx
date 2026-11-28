import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import type { AdminControls } from '../hooks/useAdministrator';

function PasswordFields() {
  return <>
    <label>New password<input name="newPassword" type="password" autoComplete="new-password" minLength={12} required/></label>
    <label>Confirm new password<input name="confirm" type="password" autoComplete="new-password" minLength={12} required/></label>
    <small>Use at least 12 characters and at most 512 bytes.</small>
  </>;
}

function passwordError(data:FormData) {
  const password = String(data.get('newPassword') ?? '');
  if (password !== data.get('confirm')) return 'New passwords must match.';
  if (password.length < 12 || new TextEncoder().encode(password).length > 512)
    return 'Use at least 12 characters and at most 512 bytes for the new password.';
  return '';
}

function EnrollmentForm({admin}:{admin:AdminControls}) {
  const picker = useRef<HTMLInputElement>(null);
  const code = useRef('');
  const selection = useRef(0);
  const [requestId,setRequestId] = useState(0);
  const [error,setError] = useState('');
  const [copyMessage,setCopyMessage] = useState('');
  const [expired,setExpired] = useState(false);
  const until = admin.setupVerification?.requestId === requestId ? admin.setupVerification.until : 0;
  useEffect(()=>()=>{code.current='';},[]);
  useEffect(()=>{
    if (!until) return;
    const timer = setTimeout(()=>{code.current='';setExpired(true);},Math.max(0,until-Date.now()));
    return ()=>clearTimeout(timer);
  },[until]);

  function selectFile(event:ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    event.currentTarget.value = '';
    const attempt = ++selection.current;
    code.current = '';
    setRequestId(0); setExpired(false); setError(''); setCopyMessage('');
    if (!file.name.toLowerCase().endsWith('.setup') || file.size < 32 || file.size > 34) {
      setError('Incorrect setup file. Select the small .setup file at the displayed path.');
      return;
    }
    const reader = new FileReader();
    const current = ()=>attempt === selection.current && picker.current !== null;
    reader.onerror = ()=>{if (current()) setError('Could not read the setup file. Choose it again.');};
    reader.onload = ()=>{
      if (!current()) return;
      const match = /^([0-9a-f]{32})(?:\r?\n)?$/.exec(String(reader.result));
      if (!match) { setError('Malformed setup file. Choose the file at the displayed path.'); return; }
      code.current = match[1];
      setRequestId(admin.manage('admin_verify_setup',{code:code.current}));
    };
    reader.readAsText(file);
  }

  async function copyPath() {
    try {
      await navigator.clipboard.writeText(admin.setupFile);
      setCopyMessage('Path copied.');
    } catch { setCopyMessage('Select and copy the path shown above.'); }
  }
  function enroll(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!code.current || until <= Date.now()) {
      setError('Choose a current setup file before enabling protection.');
      return;
    }
    const data = new FormData(e.currentTarget);
    const message = passwordError(data);
    setError(message);
    if (!message) admin.manage('admin_setup',{code:code.current,newPassword:data.get('newPassword')});
  }
  return <form onSubmit={enroll} noValidate className="admin-form">
    <p>Copy the path below. Click Choose Setup File, paste the path into the file name field, and open it.</p>
    <code>{admin.setupFile}</code>
    <div className="admin-actions">
      <button type="button" onClick={copyPath}>Copy Path</button>
      <button type="button" disabled={admin.busy} onClick={()=>picker.current?.click()}>Choose Setup File</button>
      <input type="file" accept=".setup" hidden ref={picker} onChange={selectFile} aria-label="Administrator setup file"/>
    </div>
    {copyMessage && <small role="status">{copyMessage}</small>}
    {until > 0 && !expired && <strong role="status">Setup file verified.</strong>}
    <PasswordFields/>
    {(error || expired) && <p role="alert">{error || 'The setup file has expired. Renew it and select the new file.'}</p>}
    <div className="admin-actions">
      <button type="submit" disabled={admin.busy || !until || expired}>Enable protection</button>
      <button type="button" disabled={admin.busy} onClick={()=>{
        selection.current++; code.current=''; setRequestId(0); setError(''); setExpired(false);
        admin.manage('admin_prepare');
      }}>Renew setup file</button>
    </div>
  </form>;
}

export function AccessControl({admin}:{admin?:AdminControls}) {
  const [mode,setMode] = useState<'change'|'disable'>('change');
  const [validation,setValidation] = useState('');
  const state = admin?.status;
  function submit(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget, data = new FormData(form);
    const password = data.get('password'), newPassword = data.get('newPassword');
    const message = mode === 'change' ? passwordError(data) : '';
    if (message) {setValidation(message); return;}
    setValidation('');
    admin?.manage(mode === 'change' ? 'admin_change' : 'admin_disable',{password,newPassword});
    form.reset();
  }
  return <section className="dashboard-card admin-settings">
    <h2>Administrator Protection</h2>
    {!state || state.unavailable ? <p role="status">{state?.unavailable ? 'Administrator credential storage is unavailable.' :
      'Connect to the local bridge to manage protection.'}</p> : <>
      <p role="status">{state.enabled ? 'Administrator protection enabled.' : 'Administrator protection is disabled.'}</p>
      {!state.enabled && !admin?.setupFile && <button disabled={admin?.busy} onClick={()=>admin?.manage('admin_prepare')}>Set administrator password</button>}
      {state.enabled && <div className="admin-actions">{(['change','disable'] as const).map(key=>
        <button key={key} aria-pressed={mode === key} onClick={()=>{setMode(key);setValidation('');}}>
          {key === 'change' ? 'Change password' : 'Disable protection'}</button>)}</div>}
      {!state.enabled && admin?.setupFile && <EnrollmentForm key={admin.setupFile} admin={admin}/>}
      {state.enabled && <form key={mode} onSubmit={submit} className="admin-form">
        <label>Current password<input type="password" name="password" autoComplete="current-password" required/></label>
        {mode === 'change' && <PasswordFields/>}
        <button type="submit" disabled={admin?.busy}>{mode === 'change' ? 'Save password' : 'Confirm disable'}</button>
      </form>}
      <h2>Administrator Session</h2>
      <p>{!state.enabled ? 'Protection is disabled.' : state.unlocked ? 'Unlocked' : 'Locked'}</p>
      {state.enabled && <><p>Controls lock after 15 minutes of inactivity or when the bridge disconnects.</p>
        <button disabled={admin?.busy} onClick={()=>state.unlocked ? admin?.manage('admin_lock') : admin?.unlock()}>
          {state.unlocked ? 'Lock Now' : 'Unlock administrator controls'}</button></>}
    </>}
    {(validation || (admin?.error && !admin.dialog)) && <p role="alert">{validation || admin?.error}</p>}
    <h2>Protected Operations</h2><p>Authorization protects device names and trust, detection rules and alert thresholds,
      active reverse DNS, and deletion of packet or security event history.</p>
  </section>;
}
