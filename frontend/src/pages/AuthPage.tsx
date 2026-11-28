import { useEffect, useRef } from 'react';
import type { FormEvent } from 'react';
import type { AdminControls } from '../hooks/useAdministrator';

export function UnlockDialog({admin}:{admin:AdminControls}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(()=>{
    if (!admin.dialog) return;
    const box = ref.current;
    box?.showModal();
    return ()=>box?.close();
  },[admin.dialog]);
  if (!admin.dialog) return null;
  function submit(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const password = new FormData(e.currentTarget).get('password');
    e.currentTarget.reset();
    admin.manage('admin_unlock',{password});
  }
  const cancel = ()=>{ if (admin.busy) admin.manage('admin_lock'); admin.cancel(); };
  return <dialog className="admin-dialog" ref={ref} aria-labelledby="unlock-title" aria-describedby="unlock-help"
    onCancel={e=>{e.preventDefault();cancel();}}>
    <form onSubmit={submit} className="admin-form">
      <h2 id="unlock-title">Administrator Authentication Required</h2>
      <p id="unlock-help">This action requires administrator authorization.</p>
      <label>Password<input type="password" name="password" autoComplete="current-password" autoFocus required/></label>
      {admin.error && <p role="alert">{admin.error}</p>}
      <div className="admin-actions"><button type="submit" disabled={admin.busy}>Unlock</button>
        <button type="button" onClick={cancel}>Cancel</button></div>
    </form>
  </dialog>;
}
