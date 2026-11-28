import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AccessControl } from '../components/AccessControl';
import { useAdministrator } from '../hooks/useAdministrator';

function client() {
  const send = vi.fn();
  const socket = {current:{send,readyState:WebSocket.OPEN} as unknown as WebSocket};
  const {result} = renderHook(()=>useAdministrator(socket));
  const last = ()=>JSON.parse(send.mock.calls.at(-1)![0]);
  const status = {type:'admin_status',enabled:true,unavailable:false,unlocked:false,expiresAt:null};
  act(()=>{result.current.receive(status);});
  return {result,send,last,status};
}

describe('administrator controls',()=>{
  it('resumes just the challenged command and keeps the token out of ordinary telemetry requests',()=>{
    const {result,last,status,send}=client();
    act(()=>{result.current.command('clear_packets');});
    act(()=>{result.current.receive({...status,type:'admin_required',requestId:last().requestId,challenge:'issued'});});
    expect(result.current.dialog).toBe(true);
    act(()=>{result.current.manage('admin_unlock',{password:'fixture input'});});
    const requestId=last().requestId;
    act(()=>{result.current.receive({...status,type:'admin_error',message:'Incorrect password',requestId});});
    expect(result.current.dialog).toBe(true);
    expect(result.current.error).toContain('Incorrect');
    act(()=>{result.current.manage('admin_unlock',{password:'another fixture input'});});
    act(()=>{result.current.receive({...status,unlocked:true,token:'temporary',requestId:last().requestId});});
    expect(last()).toEqual({type:'control',command:'admin_resume',token:'temporary',challenge:'issued'});
    expect(result.current.dialog).toBe(false);
    act(()=>{result.current.command('monitor');});
    expect(last()).toEqual({type:'control',command:'monitor'});
    act(()=>{result.current.command('clear_packets');});
    expect(last().token).toBe('temporary');
    act(()=>{result.current.reset();});
    expect(result.current.status).toBeNull();
    act(()=>{result.current.command('clear_packets');});
    expect(last()).not.toHaveProperty('token');
    expect(send.mock.calls.filter(([raw])=>JSON.parse(raw).command==='admin_resume')).toHaveLength(1);
  });

  it('ignores a late challenge after navigation and a late unlock after cancellation',()=>{
    const {result,last,status,send}=client();
    act(()=>{result.current.command('active_dns',{enabled:true});});
    const requestId=last().requestId;
    act(()=>{result.current.cancel();result.current.receive({...status,type:'admin_required',requestId,challenge:'old'});});
    expect(result.current.dialog).toBe(false);
    act(()=>{result.current.unlock();result.current.manage('admin_unlock',{password:'fixture input'});});
    const unlockId=last().requestId;
    act(()=>{result.current.cancel();result.current.receive({...status,unlocked:true,requestId:unlockId,token:'old'});});
    expect(result.current.status?.unlocked).toBe(false);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('validates credential confirmation before submitting and requires the current password to disable',()=>{
    const {result,send}=client();
    render(<AccessControl admin={result.current}/>);
    fireEvent.change(screen.getByLabelText('New password',{exact:true}),{target:{value:'first fixture input'}});
    fireEvent.change(screen.getByLabelText('Confirm new password'),{target:{value:'second fixture input'}});
    fireEvent.submit(screen.getByRole('button',{name:'Save password'}).closest('form')!);
    expect(screen.getByRole('alert')).toHaveTextContent('New passwords must match');
    expect(send).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'Disable protection'}));
    expect(screen.getByLabelText('Current password')).toBeRequired();
    expect(screen.queryByLabelText('New password',{exact:true})).toBeNull();
  });
});

function enrollment() {
  const {result,send,last,status}=client();
  act(()=>{result.current.manage('admin_prepare');});
  const path = '/private/current.setup';
  act(()=>{result.current.receive({...status,enabled:false,requestId:last().requestId,setupFile:path});});
  const ui=render(<AccessControl admin={result.current}/>);
  const refresh=()=>ui.rerender(<AccessControl admin={result.current}/>);
  function choose(contents:string,name='current.setup') {
    const file = new File([contents],name);
    fireEvent.change(screen.getByLabelText('Administrator setup file'),{target:{files:[file]}});
  }
  const verify=()=>{
    act(()=>{result.current.receive({...status,enabled:false,requestId:last().requestId,setupFile:path,
      setupVerifiedUntil:Date.now()+600_000});});
    refresh();
  };
  return {choose,verify,result,last,send,refresh,status,path};
}

describe('setup file enrollment',()=>{
  it('confirms the file through the bridge and clears the proof and password fields after enrollment',async()=>{
    const {choose,verify,result,last,send,refresh,status}=enrollment();
    const proof=crypto.randomUUID().replaceAll('-','');
    choose(proof+'\n');
    await waitFor(()=>expect(last()).toMatchObject({command:'admin_verify_setup',code:proof}));
    expect(screen.queryByText('Setup file verified.')).toBeNull();
    verify();
    expect(screen.getByText('Setup file verified.')).toBeVisible();
    expect(document.body.textContent).not.toContain(proof);
    expect(screen.queryByDisplayValue(proof)).toBeNull();
    const button=screen.getByRole('button',{name:'Enable protection'});
    const password=screen.getByLabelText('New password',{exact:true});
    const confirm=screen.getByLabelText('Confirm new password');
    for (const [value,confirmation,reason] of [
      ['short','short','at least 12'],['first fixture password','second fixture password','must match'],
      ['€'.repeat(180),'€'.repeat(180),'512 bytes']]) {
      fireEvent.change(password,{target:{value}});
      fireEvent.change(confirm,{target:{value:confirmation}});
      fireEvent.click(button);
      expect(screen.getByRole('alert')).toHaveTextContent(reason);
      expect(send).toHaveBeenCalledTimes(2);
    }
    const valid='valid fixture password';
    fireEvent.change(password,{target:{value:valid}});
    fireEvent.change(confirm,{target:{value:valid}});
    fireEvent.click(button);
    expect(last()).toMatchObject({command:'admin_setup',code:proof,newPassword:valid});
    act(()=>{result.current.receive({...status,requestId:last().requestId});});
    refresh();
    expect(screen.getByText('Administrator protection enabled.')).toBeVisible();
    expect(screen.getByText('Locked')).toBeVisible();
    expect(screen.queryByText('Setup file verified.')).toBeNull();
    expect(screen.queryByDisplayValue(valid)).toBeNull();
    expect(screen.queryByLabelText('Administrator setup file')).toBeNull();
  });

  it('rejects a malformed, oversized, or unrelated file before sending its contents',async()=>{
    const {choose,send}=enrollment();
    choose('z'.repeat(32));
    await screen.findByText(/Malformed setup file/);
    choose('a'.repeat(35));
    expect(screen.getByRole('alert')).toHaveTextContent('Incorrect setup file');
    choose('a'.repeat(32),'credentials.json');
    expect(send).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button',{name:'Enable protection'})).toBeDisabled();
  });

  it('shows backend rejection, permits renewal and copies only the displayed path',async()=>{
    const {choose,last,result,refresh,status,path}=enrollment();
    const proof=crypto.randomUUID().replaceAll('-','');
    const copy = vi.fn().mockResolvedValue(undefined);
    const original=Object.getOwnPropertyDescriptor(navigator,'clipboard');
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:copy}});
    try {
      fireEvent.click(screen.getByRole('button',{name:'Copy Path'}));
      await screen.findByText('Path copied.');
      expect(copy).toHaveBeenCalledExactlyOnceWith(path);
    } finally {
      if (original) Object.defineProperty(navigator,'clipboard',original);
      else Reflect.deleteProperty(navigator,'clipboard');
    }
    choose(proof+'\r\n');
    await waitFor(()=>expect(last().command).toBe('admin_verify_setup'));
    act(()=>{result.current.receive({...status,type:'admin_error',requestId:last().requestId,message:'The setup file has expired.'});});
    refresh();
    expect(screen.getByRole('alert')).toHaveTextContent('expired');
    expect(screen.getByRole('button',{name:'Enable protection'})).toBeDisabled();
    fireEvent.click(screen.getByRole('button',{name:'Renew setup file'}));
    expect(last().command).toBe('admin_prepare');
  });
});
