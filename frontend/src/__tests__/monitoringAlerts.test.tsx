import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { MonitoringAlerts } from '../components/MonitoringAlerts';
import type { Capture } from '../hooks/useCapture';
import { isAlertPacket } from '../alertEvidence';
import type { Packet, MonitorView, SecurityEvent } from '../types';

const source = '\\Device\\NPF_{00000000-0000-0000-0000-000000000001}';
const entry: SecurityEvent = {id:'a',scope:'lab',source,origin:'Replay',time:1000,severity:'Medium',
  type:'Conflicting ARP claims',ip:'192.0.2.4',mac:'02:00:00:00:00:04',evidence:'Evidence '+ 'abcd'.repeat(400),acknowledged:false};
const view: MonitorView = {type:'monitor',status:'Replay',eventTotal:1,eventMatches:1,eventOffset:0,
  unacknowledged:1,severityCounts:{Medium:1},eventTypes:[entry.type],events:[entry],devices:[],interfaceNames:{[source]:'Ethernet'},
  storageError:'',deviceTotal:0,trustedTotal:0,matchingTotal:0,offset:0,suppressed:0,missed:0,capacityReached:false,
  rules:{arp:true,gateway:true,spike:true,discovery:'unknown',pps:1000}};
function capture(monitor:MonitorView|undefined,connected=true) {
  return {monitor,connected,error:'',eventFilter:{status:'',severity:'',type:''},setEventFilter:vi.fn(),
    setEventOffset:vi.fn(),command:vi.fn(),sourceNames:{},stats:{outputDrops:0},packets:[]} as unknown as Capture;
}
it.each([['Info','Info'],['Medium','Warning'],['Critical','Critical']])('presents %s with full expandable evidence', (level,label)=>{
  const state=capture({...view,events:[{...entry,severity:level}]});
  render(<MonitoringAlerts capture={state} onPackets={vi.fn()}/>);
  const card=screen.getByRole('article');
  expect(card).toHaveAttribute('data-severity',label);
  expect(within(card).getByText('Possible ARP Spoofing')).toBeVisible();
  expect(within(card).queryByText(level)).toBeNull();
  expect(within(card).queryByText(source)).toBeNull();
  fireEvent.click(within(card).getByRole('button',{expanded:false}));
  const details=within(card).getByRole('region',{name:'Alert details'});
  expect(within(details).getByText(level)).toBeVisible();
  expect(within(details).getByText(entry.evidence)).toBeVisible();
  expect(within(details).getByText(source)).toBeVisible();
  expect(within(details).getByText('Ethernet')).toBeVisible();
  expect(within(details).queryByRole('button',{name:/related packets/i})).toBeNull();
});
it('keeps filters in the acknowledgment request and saves supported rule settings',()=>{
  const state=capture(view);
  render(<MonitoringAlerts capture={state} onPackets={vi.fn()}/>);
  fireEvent.change(screen.getByLabelText('Severity'),{target:{value:'Medium'}});
  expect(state.setEventOffset).toHaveBeenCalledWith(0);
  const update=vi.mocked(state.setEventFilter).mock.calls[0][0];
  expect(typeof update==='function' && update(state.eventFilter).severity).toBe('Medium');
  fireEvent.click(screen.getByRole('button',{name:'Acknowledge'}));
  expect(state.command).toHaveBeenCalledWith('ack_event',{id:'a',eventFilter:state.eventFilter,eventOffset:0});
  fireEvent.click(screen.getByText('Configure alert rules'));
  fireEvent.change(screen.getByLabelText('Frames per second'),{target:{value:'80'}});
  fireEvent.click(screen.getByRole('button',{name:'Save monitoring rules'}));
  expect(state.command).toHaveBeenCalledWith('monitor_rules',expect.objectContaining({rules:{...view.rules,pps:80}}));
});
it('distinguishes empty, filtered, unavailable and disconnected history',()=>{
  const props={onPackets:vi.fn()};
  const empty={...view,events:[],eventTotal:0,eventMatches:0};
  const {rerender}=render(<MonitoringAlerts capture={capture(empty)} {...props}/>);
  expect(screen.getByText('No security events recorded.')).toBeVisible();
  rerender(<MonitoringAlerts capture={capture({...empty,eventTotal:2})} {...props}/>);
  expect(screen.getByText('No alerts match the current filters.')).toBeVisible();
  rerender(<MonitoringAlerts capture={capture({...empty,status:'Adapter metadata unavailable.'})} {...props}/>);
  expect(screen.getByText('Monitoring unavailable on this adapter.')).toBeVisible();
  rerender(<MonitoringAlerts capture={capture(undefined,false)} {...props}/>);
  expect(screen.getByRole('status')).toHaveTextContent('disconnected');
});

it('only links retained records inside the scoped alert observation window',()=>{
  const details={id:1,captureSource:source,networkScope:'lab',timestampUs:900000,sizeBytes:60,
    network:'ARP',protocol:'OTHER',source:entry.ip,destination:'192.0.2.1',sourceMac:entry.mac};
  const packet: Packet={id:1,timestamp:900,details,source:details.source,destination:details.destination,
    protocol:'ARP',name:'',time:'',size:'60 B',sizeBytes:60};
  expect(isAlertPacket(packet,entry)).toBe(true);
  expect(isAlertPacket(packet,{...entry,scope:'different'})).toBe(false);
  expect(isAlertPacket(packet,{...entry,time:40000})).toBe(false);
  const rate={...entry,type:'Capture rate above threshold',ip:'',mac:'',measurement:{from:800,thresholdPps:2000}};
  expect(isAlertPacket(packet,rate)).toBe(true);
  expect(isAlertPacket(packet,{...rate,measurement:undefined})).toBe(false);
  expect(isAlertPacket(packet,{...rate,time:850})).toBe(false);
});

it('presents an untrusted arrival as a reviewable device observation and retains Info in details',()=>{
  const arrival={...entry,type:'Device arrival',severity:'Info',evidence:'First observation after baseline via ARP sender. Trust: untrusted.'};
  const state=capture({...view,events:[arrival]});
  const {rerender}=render(<MonitoringAlerts capture={state} onPackets={vi.fn()}/>);
  const card=within(screen.getByRole('article'));
  expect(card.getByText('New Device')).toBeVisible();
  expect(card.getByText('Needs review')).toBeVisible();
  expect(card.queryByText(arrival.evidence)).toBeNull();
  fireEvent.click(card.getByRole('button',{expanded:false}));
  expect(card.getByText('Info')).toBeVisible();
  expect(card.getByText(arrival.evidence)).toBeVisible();
  rerender(<MonitoringAlerts capture={capture({...view,events:[{...arrival,acknowledged:true}]})} onPackets={vi.fn()}/>);
  expect(card.queryByText('Needs review')).toBeNull();
});
