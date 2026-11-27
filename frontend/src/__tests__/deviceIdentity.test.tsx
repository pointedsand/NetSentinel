import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
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
  const open=vi.fn(); render(<DeviceCard device={d} adapter="Ethernet" open={open}/>);
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
