import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LogViewerPage } from '../pages/LogViewerPage';

afterEach(()=>{delete window.netSentinelArchives;});

it('opens saved rows by mouse and keyboard and bounds page jumps across archive switches',async()=>{
  const header='ID,Source,Destination,Protocol,Size,Name,Timestamp,Time';
  const files=['large.csv','small.csv'].map((name,index)=>{
    const rows=Array.from({length:index ? 1 : 45},(_,i)=>[i,'source-'+i,'peer','UDP','64 B','',i,'time'].join(','));
    const data=new TextEncoder().encode([header,...rows].join('\n'));
    return {name,stamp:'1',modified:1,count:null,size:data.length,data};
  });
  const read=vi.fn(async (name:string)=>files.find(f=>f.name===name)!.data);
  window.netSentinelArchives={list:async()=>files,read,show:vi.fn(),begin:vi.fn(),append:vi.fn(),finish:vi.fn(),abort:vi.fn()};
  render(<LogViewerPage archiveUnavailable/>);
  const large=await screen.findByRole('row',{name:'Open large.csv'});
  const small=screen.getByRole('row',{name:'Open small.csv'});
  const selection=window.getSelection()!;
  selection.selectAllChildren(within(large).getByText('large.csv'));
  fireEvent.click(large);
  expect(read).not.toHaveBeenCalled();
  selection.removeAllRanges();
  fireEvent.click(large);
  const heading=await screen.findByRole('heading',{name:'Saved archive · large.csv'});
  expect(large.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(large).toHaveAttribute('aria-current','true');
  const viewer=within(heading.closest('section')!);
  const page=()=>screen.getByRole('spinbutton',{name:'Archive page number'});
  const jump=(value:string)=>{
    fireEvent.change(page(),{target:{value}});
    fireEvent.keyDown(page(),{key:'Enter'});
  };
  fireEvent.click(viewer.getByRole('button',{name:'Next'}));
  expect(page()).toHaveValue(2);
  jump('99');
  expect(viewer.getByText('source-44')).toBeInTheDocument();
  expect(page()).toHaveValue(3);
  jump('1.5');
  expect(page()).toHaveValue(3);
  jump('-1');
  expect(page()).toHaveValue(1);
  expect(viewer.getByRole('button',{name:'Previous'})).toBeDisabled();
  jump('2');
  fireEvent.keyDown(small,{key:' '});
  await screen.findByRole('heading',{name:'Saved archive · small.csv'});
  expect(small).toHaveAttribute('aria-current','true');
  expect(large).toHaveAttribute('aria-current','false');
  expect(page()).toHaveValue(1);
  expect(viewer.getByRole('button',{name:'Next'})).toBeDisabled();
  fireEvent.click(viewer.getByRole('button',{name:'Close log'}));
  expect(small).toHaveAttribute('aria-current','false');
  fireEvent.keyDown(large,{key:'Enter'});
  await screen.findByRole('heading',{name:'Saved archive · large.csv'});
  expect(read).toHaveBeenCalledTimes(3);
});
