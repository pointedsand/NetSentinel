const {contextBridge,ipcRenderer} = require('electron');

contextBridge.exposeInMainWorld('netSentinelArchives',{
  list:()=>ipcRenderer.invoke('archive:list'),
  read:(name,stamp,offset,length)=>ipcRenderer.invoke('archive:read',name,stamp,offset,length),
  show:()=>ipcRenderer.invoke('archive:show'),
  begin:format=>ipcRenderer.invoke('archive:begin',format),
  append:(id,rows)=>ipcRenderer.invoke('archive:append',id,rows),
  finish:id=>ipcRenderer.invoke('archive:finish',id),
  abort:id=>ipcRenderer.invoke('archive:abort',id)
});
