import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LogViewerPage } from '../pages/LogViewerPage';
import { PacketsPage } from '../pages/PacketsPage';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('reads a selected file once and ignores cancellation', async () => {
  const onImport = vi.fn();
  render(<StrictMode><LogViewerPage onImport={onImport}/></StrictMode>);
  const input = screen.getByLabelText('Choose log files to upload');
  fireEvent.change(input,{target:{files:[]}});
  expect(onImport).not.toHaveBeenCalled();
  const file = {name:'packets.json',size:2,text:vi.fn().mockResolvedValue('[]')};
  fireEvent.change(input,{target:{files:[file]}});
  await waitFor(()=>expect(onImport).toHaveBeenCalledOnce());
  expect(file.text).toHaveBeenCalledOnce();
  expect(onImport).toHaveBeenCalledWith({name:file.name,packets:[]});
});

it('reports a File API read failure without reopening the chooser', async () => {
  render(<LogViewerPage/>);
  const input = screen.getByLabelText('Choose log files to upload');
  const choose = vi.spyOn(input,'click');
  fireEvent.click(screen.getByRole('button',{name:'Upload'}));
  fireEvent.change(input,{target:{files:[{name:'file.csv',size:5,text:async()=>{throw Error('Read denied');}}]}});
  expect(await screen.findByRole('alert')).toHaveTextContent('Read denied');
  expect(choose).toHaveBeenCalledOnce();
});

it('downloads once even when a native save picker exists', () => {
  const save = vi.fn();
  vi.stubGlobal('showSaveFilePicker',save);
  vi.stubGlobal('URL',class extends URL {
    static createObjectURL = vi.fn(()=> 'blob:export');
    static revokeObjectURL = vi.fn();
  });
  const download = vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
  render(<StrictMode><PacketsPage live packets={[]} onClear={()=>{}} isCapturing={false}
    setIsCapturing={()=>{}} onNavigateDashboard={()=>{}} /></StrictMode>);
  fireEvent.click(screen.getByRole('button',{name:'Export'}));
  fireEvent.click(screen.getByRole('button',{name:'Download Export'}));
  expect(save).not.toHaveBeenCalled();
  expect(download).toHaveBeenCalledOnce();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:export');
});
