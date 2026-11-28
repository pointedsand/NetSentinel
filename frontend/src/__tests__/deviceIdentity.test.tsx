import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { DeviceObservations } from '../components/DeviceObservations';
import { DeviceCard } from '../components/DeviceCard';
import { DevicesPage } from '../pages/DevicesPage';
import { deviceName, interfaceName, isDevicePacket } from '../deviceIdentity';
import type { LocalDevice, Packet } from '../types';

const device: LocalDevice = {id:'lab/mac',scope:'lab',source:'adapter',mac:'02:00:00:00:00:01',ips:['192.0.2.1'],
  first:1000,last:2000,label:'',hostname:'desk.local',trusted:false,evidence:'ARP sender'};
function packet(destination: string, time:number): Packet {
  return {id:time,source:device.ips[0],destination,protocol:'UDP',size:'60 B',sizeBytes:60,name:'',timestamp:time,time:'',
    details:{id:time,captureSource:'adapter',networkScope:'lab',source:device.ips[0],destination,
      sourceMac:device.mac,protocol:'UDP',timestampUs:time*1000,sizeBytes:60}};
}
it('prefers operator labels then current hostname and keeps a recognizable unknown identity',()=>{
  expect(deviceName(device)).toBe('desk.local');
  expect(deviceName({...device,label:'Office'})).toBe('Office');
  const d={...device,nameExpired:true};
  const open=vi.fn(); render(<DeviceCard device={d} adapter="Ethernet" open={open} disabled={false} change={vi.fn()}/>);
  fireEvent.click(screen.getByRole('button',{name:'Details for Unknown Device · '+device.mac})); expect(open).toHaveBeenCalledOnce();
  expect(screen.getByText('192.0.2.1')).toBeInTheDocument();
  expect(interfaceName('adapter',{adapter:'Wi-Fi'})).toBe('Wi-Fi');
});
it('associates retained packets by network, MAC and corresponding IP together',()=>{
  const p=packet('192.0.2.8',1000);
  expect(isDevicePacket(p,device)).toBe(true);
  expect(isDevicePacket(p,{...device,scope:'other'})).toBe(false);
  expect(isDevicePacket(p,{...device,ips:['192.0.2.8']})).toBe(false);
});
it('searches and sorts observed endpoints without changing the underlying packet list',()=>{
  render(<DevicesPage observed packets={[packet('192.0.2.8',1000),packet('192.0.2.2',2000)]} onNavigateDashboard={()=>{}}/>);
  fireEvent.change(screen.getByLabelText('Sort endpoints'),{target:{value:'address'}});
  const rows=within(screen.getByRole('table')).getAllByRole('row');
  expect(within(rows[2]).getAllByRole('cell')[0].textContent).toBe('192.0.2.2');
  fireEvent.change(screen.getByLabelText('Search endpoints'),{target:{value:'192.0.2.8'}});
  expect(screen.getAllByRole('row')).toHaveLength(2);
});

it('edits only the requested preference and validates inline saves and cancellation',()=>{
  const change=vi.fn(), open=vi.fn();
  const props={device,change,open,adapter:'Ethernet',disabled:false};
  const {rerender}=render(<DeviceCard {...props}/>);
  const name=screen.getByRole('button',{name:'desk.local'});
  fireEvent.click(name);
  expect(screen.queryByRole('textbox')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Trust'}));
  expect(change).toHaveBeenLastCalledWith({trusted:true});
  for (const [value,end] of [['Discard','Escape'],['  ','Enter'],['Printer','Enter'],['Lab','blur']]) {
    fireEvent.doubleClick(screen.getByRole('button',{name:'desk.local'}));
    const input=screen.getByRole('textbox') as HTMLInputElement;
    expect(input).toHaveFocus();
    expect(input.selectionEnd).toBe(input.value.length);
    fireEvent.change(input,{target:{value}});
    if (end==='blur') fireEvent.blur(input); else fireEvent.keyDown(input,{key:end});
    if (!value.trim()) expect(screen.getByRole('alert')).toBeVisible();
  }
  expect(change.mock.calls).toEqual([[{trusted:true}],[{label:'Printer'}],[{label:'Lab'}]]);
  rerender(<DeviceCard {...props} device={{...device,trusted:true}}/>);
  fireEvent.click(screen.getByRole('button',{name:'Untrust'}));
  expect(change).toHaveBeenLastCalledWith({trusted:false});
  expect(open).not.toHaveBeenCalled();
});

it('bounds the retained observations and holds an older page while new packets arrive',async()=>{
  const rows=Array.from({length:2000},(_,i)=>packet('192.0.2.8',2000-i));
  rows[0].details!.destinationPort=53;
  const inspect=vi.fn();
  const {rerender}=render(<DeviceObservations packets={rows} device={device} inspect={inspect}/>);
  fireEvent.click(screen.getByText('Associated Endpoints'));
  expect(await screen.findByText('53')).toBeVisible();
  fireEvent.click(screen.getByText('Associated Packets'));
  await screen.findByRole('button',{name:'Inspect packet 2000'});
  expect(screen.getAllByRole('button',{name:/Inspect packet/})).toHaveLength(20);
  fireEvent.click(screen.getByRole('button',{name:'Older'}));
  rerender(<DeviceObservations packets={[packet('192.0.2.9',2001),...rows]} device={device} inspect={inspect}/>);
  fireEvent.click(screen.getByRole('button',{name:'Inspect packet 1980'}));
  expect(inspect).toHaveBeenCalledWith(1980);
  expect(screen.queryByRole('button',{name:'Inspect packet 1981'})).toBeNull();
});
