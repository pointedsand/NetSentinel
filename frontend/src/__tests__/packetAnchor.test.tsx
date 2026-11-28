import {fireEvent,render,screen} from '@testing-library/react';
import {expect,it} from 'vitest';
import {PacketsPage} from '../pages/PacketsPage';

it.each([5000,30000,50000])('anchors the same mounted row across prepends and eviction at %i',limit=>{
  const packet=(id:number)=>({id,name:'row',source:'a',destination:'b',protocol:'UDP',size:'60 B',sizeBytes:60,time:'now',timestamp:id});
  let rows=Array.from({length:limit},(_,i)=>packet(limit-i));
  const view=()=><PacketsPage live inShell packets={rows} onClear={()=>{}} isCapturing setIsCapturing={()=>{}} onNavigateDashboard={()=>{}}/>;
  const {container,rerender}=render(view());
  const box=container.querySelector('.packet-virtualized-container') as HTMLDivElement;
  Object.defineProperty(box,'clientHeight',{value:410});
  box.scrollTop=41*123+7;fireEvent.scroll(box);
  const id=limit-123;
  const original=screen.getByRole('checkbox',{name:'Select packet '+id});
  fireEvent.click(original);
  for (let i=0;i<5;i++) {
    const next=Array.from({length:32},(_,n)=>packet(rows[0].id+32-n));
    rows=next.concat(rows.slice(0,limit-32));
    rerender(view());
    expect(screen.getByRole('checkbox',{name:'Select packet '+id})).toBe(original);
    expect(original).toBeChecked();
    expect(box.scrollTop).toBe(41*(123+32*(i+1))+7);
  }
  box.scrollTop=41*(limit-12);fireEvent.scroll(box);
  rows=rows.slice(0,100);
  rerender(view());
  expect(screen.getByRole('button',{name:String(rows.at(-1)!.id)})).toBeVisible();
  fireEvent.click(screen.getByRole('button',{name:'Jump to newest'}));
  expect(box.scrollTop).toBe(0);
  expect(screen.getByRole('button',{name:String(rows[0].id)})).toBeVisible();
});
