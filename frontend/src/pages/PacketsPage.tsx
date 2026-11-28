import { saveArchive } from '../services/archives';
import { downloadFile } from '../services/browserFiles';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Packet } from '../types';
import { createExportFile, type ExportFormat } from './packetExport';

const detailLabels: Record<string,string> = {
  id:'Packet number', captureSource:'Capture source', timestampUs:'Timestamp (Unix µs)',
  source:'Source IP', destination:'Destination IP', sourceMac:'Source MAC', destinationMac:'Destination MAC',
  sourcePort:'Source port',destinationPort:'Destination port',network:'Network protocol',transport:'Transport protocol',
  sourceHostname:'Source PTR',destinationHostname:'Destination PTR',sni:'TLS ClientHello SNI',
  flowSni:'SNI observed on this flow', observedDns:'DNS observed for this client',dnsAnswers:'DNS answers',
  sizeBytes:'Original length (bytes)',capturedBytes:'Captured length (bytes)',ttlOrHopLimit:'TTL / hop limit',
  decodeStatus:'Header decode status',payloadStatus:'Payload status',icmpType:'ICMP type',arpOperation:'ARP operation',
  tcpFlags:'TCP flags',vlanIds:'VLAN IDs',ipVersion:'IP version',ipProtocol:'IP protocol number',
  dhcpHostname:'DHCP client hostname',netbiosName:'NetBIOS responder name',netbiosTtl:'NetBIOS name lifetime (seconds)',
  etherType:'EtherType',linkType:'Link layer',application:'Application classification',dnsQuestion:'DNS question'
};
function detailText(key:string,value:unknown) {
  if (key==='etherType' && typeof value==='number') return '0x'+value.toString(16).padStart(4,'0');
  if (key==='linkType' && value===1) return 'Ethernet (DLT_EN10MB)';
  if (key==='tcpFlags' && typeof value==='number') return '0x'+value.toString(16);
  if (key==='observedDns' && value && typeof value==='object' && 'name' in value) return String(value.name);
  if (Array.isArray(value)) return value.map(v => typeof v==='object' ? JSON.stringify(v) : String(v)).join(', ');
  return String(value);
}

const PACKET_ROW_HEIGHT = 41;
const PACKET_HEADER_HEIGHT = 41;
const PACKET_OVERSCAN = 8;
const PACKET_VIEWPORT_HEIGHT = 600;

export function PacketsPage({
  packets,
  onClear,
  isCapturing,
  setIsCapturing,
  onNavigateDashboard, live = false, disabled = false, matching, search, onSearch, initialDetail = null, rail, inShell = false
}: {
  inShell?: boolean;
  rail?: React.ReactNode;
  matching?: Packet[];
  search?: string;
  onSearch?: (query: string) => void;
  initialDetail?: number | null;
  live?: boolean;
  disabled?: boolean;
  packets: Packet[];
  onClear: () => void;
  isCapturing: boolean;
  setIsCapturing: (val: boolean) => void;
  onNavigateDashboard: () => void;
}) {
  const [filterText, setFilterText] = useState('');
  const [detailId, showDetails] = useState<number | null>(initialDetail);
  const detail = useMemo(() => detailId === null ? undefined : packets.find(p => p.id === detailId), [packets,detailId]);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>(live ? 'CSV' : 'PCAP');
  const [exportRange, setExportRange] = useState('all');
  const [selectedPacketIds, setSelectedPacketIds] = useState<number[]>([]);
  const [position,setPosition] = useState({top:0, id:0, inset:0});
  const [tableViewportHeight, setTableViewportHeight] = useState(PACKET_VIEWPORT_HEIGHT);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const filteredPackets = useMemo(() => {
    if (matching) return matching;
    const q = filterText.toLowerCase();
    if (!q) return packets;
    return packets.filter(p => (
      p.source.toLowerCase().includes(q) ||
      p.destination.toLowerCase().includes(q) ||
      p.protocol.toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q)
    ));
  }, [filterText, packets, matching]);

  const tableScrollTop = useMemo(() => {
    // IDs increase at capture time. Keep the same packet under the pointer as new rows arrive.
    if (!live || !position.id || !filteredPackets.length) return position.top;
    let low = 0, high = filteredPackets.length;
    while (low < high) {
      const mid = Math.floor((low+high)/2);
      if (filteredPackets[mid].id > position.id) low = mid+1;
      else high = mid;
    }
    const target = Math.min(low,filteredPackets.length-1)*PACKET_ROW_HEIGHT + position.inset;
    const bottom = PACKET_HEADER_HEIGHT + filteredPackets.length*PACKET_ROW_HEIGHT - tableViewportHeight;
    return Math.min(target,Math.max(0,bottom));
  },[filteredPackets,live,position,tableViewportHeight]);
  useLayoutEffect(() => {
    const box = tableContainerRef.current;
    if (!box || typeof ResizeObserver==='undefined') return;
    const observer = new ResizeObserver(()=>{
      if (box.clientHeight) setTableViewportHeight(box.clientHeight);
    });
    observer.observe(box);
    return ()=>observer.disconnect();
  },[]);
  useLayoutEffect(() => {
    const box = tableContainerRef.current;
    if (live && box && Math.abs(box.scrollTop-tableScrollTop) >= 1) box.scrollTop = tableScrollTop;
  },[live,tableScrollTop]);
  function jumpToNewest() {
    if (tableContainerRef.current) tableContainerRef.current.scrollTop = 0;
    setPosition({top:0,id:0,inset:0});
  }

  const oldest = packets.at(-1)?.id;
  const selected = useMemo(() => new Set(selectedPacketIds.filter(id => oldest != null && (!live || id >= oldest))),
    [selectedPacketIds,oldest,live]);

  // Render the visible window plus overscan; spacer rows preserve the full scroll height.
  const firstVisiblePacket = Math.max(
    0,
    Math.min(
      filteredPackets.length - 1,
      Math.floor(Math.max(0, tableScrollTop - PACKET_HEADER_HEIGHT) / PACKET_ROW_HEIGHT)
    )
  );
  const visiblePacketStart = Math.max(0, firstVisiblePacket - PACKET_OVERSCAN);
  const visiblePacketEnd = Math.min(
    filteredPackets.length,
    Math.ceil(
      Math.max(0, tableScrollTop + tableViewportHeight - PACKET_HEADER_HEIGHT) / PACKET_ROW_HEIGHT
    ) + PACKET_OVERSCAN
  );
  const visiblePackets = filteredPackets.slice(visiblePacketStart, visiblePacketEnd);
  const topSpacerHeight = visiblePacketStart * PACKET_ROW_HEIGHT;
  const bottomSpacerHeight = (filteredPackets.length - visiblePacketEnd) * PACKET_ROW_HEIGHT;

  const [exportError,setExportError] = useState('');
  // Original notes for the retired native-picker workflow:
  // Fully functional file export handler with native file location picker
    // Check if the browser supports the File System Access API for custom save dialogs
        // Opens native OS save location dialog
        // If user cancels the prompt, don't throw an error
    // Fallback for browsers that don't support showSaveFilePicker (e.g., Firefox, Safari)

  const desktopArchive = live ? window.netSentinelArchives : undefined;
  const [saving,setSaving] = useState(false);
  const [savedName,setSavedName] = useState('');
  const handleExport = async () => {
    if (saving) return;
    setExportError('');
    let dataToExport = packets;
    if (exportRange === 'filtered') {
      dataToExport = filteredPackets;
    } else if (exportRange === 'selected') {
      dataToExport = packets.filter(p => selected.has(p.id));
    }

    if (desktopArchive && exportFormat!=='PCAP') {
      setSaving(true);
      try {
        setSavedName(await saveArchive(desktopArchive,exportFormat,dataToExport));
        setShowExportModal(false);
      } catch (error) { setExportError((error as Error).message); }
      finally { setSaving(false); }
      return;
    }
    const exportFile = createExportFile(dataToExport, exportFormat);
    const suggestedName = `netsentinel-capture-${Date.now()}.${exportFile.extension}`;
    try {
      downloadFile(suggestedName, exportFile.content, exportFile.mimeType);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Unable to download export.');
      return;
    }
    setShowExportModal(false);
  };

  return (
    <div className="packet-capture-view desktop-packets">
      {!inShell && <div className="capture-header-bar">
        <button onClick={onNavigateDashboard} className="back-link">&lt; Dashboard</button>
        <h2>Live Packet Capture</h2>
        <span className="time-display">{new Date().toLocaleTimeString(undefined, { timeZoneName: 'short' })}</span>
      </div>}

      <section className="packet-stream"><div className="capture-toolbar">
        <div className="toolbar-left">
          <div className="filter-group">
            <label htmlFor="packet-search">Search packets</label>
            <input
              id="packet-search" type="search"
              placeholder={live ? "Filter by name, protocol, IP or port..." : "Filter by name, protocol, or IP..."}
              value={search ?? filterText}
              onChange={(e) => {
                (onSearch ?? setFilterText)(e.target.value);
                jumpToNewest();
              }}
              className="filter-input"
            />
          </div>
        </div>

        {live && position.top > 0 && <button className="tool-btn" onClick={jumpToNewest}>Jump to newest</button>}
        {!live && <div className="toolbar-right">
          <span className="packet-counter">Captured: <strong>{packets.length.toLocaleString()}</strong></span>
        </div>}
      </div>

      <div
        ref={tableContainerRef}
        className="packet-table-container packet-virtualized-container"
        onScroll={(event) => {
          const top = event.currentTarget.scrollTop;
          const index = Math.floor(top/PACKET_ROW_HEIGHT);
          setPosition({top,id:top > 0 ? filteredPackets[index]?.id ?? 0 : 0,inset:top % PACKET_ROW_HEIGHT});
          setTableViewportHeight(event.currentTarget.clientHeight || PACKET_VIEWPORT_HEIGHT);
        }}
      >
        <table className="packet-table">
          <thead>
            <tr>
              <th style={{ width: '40px' }}>
                <input
                  type="checkbox" aria-label="Select all displayed packets"
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedPacketIds(filteredPackets.map(p => p.id));
                    } else {
                      setSelectedPacketIds([]);
                    }
                  }}
                />
              </th>
              <th>No.</th>
              <th>Source</th>
              <th>Destination</th>
              <th>Protocol</th>
              <th>Size</th>
              <th>Name</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {filteredPackets.length > 0 ? (
              <>
                {topSpacerHeight > 0 && (
                  <tr className="packet-virtual-spacer" aria-hidden="true">
                    <td colSpan={8} style={{ height: topSpacerHeight }} />
                  </tr>
                )}
                {visiblePackets.map((pkt, index) => (
                  <tr key={pkt.id} onClick={live ? () => showDetails(pkt.id) : undefined}>
                    <td>
                      <input
                        type="checkbox" aria-label={'Select packet '+pkt.id}
                        onClick={event => event.stopPropagation()}
                        checked={selected.has(pkt.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedPacketIds(prev => [...prev.filter(id => !live || (oldest != null && id >= oldest)), pkt.id]);
                          } else {
                            setSelectedPacketIds(prev => prev.filter(id => id !== pkt.id));
                          }
                        }}
                      />
                    </td>
                    <td className="row-num">{live ? <button onClick={() => showDetails(pkt.id)}>{pkt.id}</button> : (visiblePacketStart + index + 1) + '.'}</td>
                    <td title={pkt.source}>{pkt.source}</td>
                    <td title={pkt.destination}>{pkt.destination}</td>
                    <td className="protocol-cell">{pkt.protocol}</td>
                    <td>{pkt.size}</td>
                    <td className="name-cell" title={pkt.name}>{pkt.name}</td>
                    <td className="time-cell">{pkt.time}</td>
                  </tr>
                ))}
                {bottomSpacerHeight > 0 && (
                  <tr className="packet-virtual-spacer" aria-hidden="true">
                    <td colSpan={8} style={{ height: bottomSpacerHeight }} />
                  </tr>
                )}
              </>
            ) : (
              <tr>
                <td colSpan={8} className="no-data">No matching packets found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      </section>
      <aside className="packet-rail" aria-label="Capture session controls"><section className="dashboard-card rail-card">
        {rail || <h2>Capture session</h2>}
        {!inShell && <button
            disabled={disabled}
            onClick={() => setIsCapturing(!isCapturing)}
            className={`control-btn ${isCapturing ? 'btn-stop' : 'btn-start'}`}
          >
            {isCapturing ? 'Stop' : 'Start'}
          </button>}
        <div className="rail-actions"><button onClick={() => setShowExportModal(true)} className="tool-btn">Export</button>
          <button
            disabled={live && (isCapturing || disabled)}
            onClick={() => { showDetails(null); setSelectedPacketIds([]); onClear(); }}
            className="tool-btn"
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.16)',
              color: '#f87171',
              borderColor: 'rgba(239, 68, 68, 0.4)',
            }}
          >
            {live ? 'Clear Capture Log' : 'Clear Logs'}
          </button></div>
      </section>
      {live && detail?.details && <section className="dashboard-card packet-details" aria-label="Packet details">
        <button onClick={() => showDetails(null)}>Close details</button>
        <h3>Packet {detail.id} · {detail.protocol}</h3>
        <dl>{Object.entries(detail.details).filter(([,v]) => v != null && v !== '' &&
          (!Array.isArray(v) || v.length > 0)).filter(([key]) => key in detailLabels).map(([key,value]) =>
          <div key={key}><dt>{detailLabels[key]}</dt><dd>{detailText(key,value)}</dd></div>)}</dl>
      </section>}
      </aside>
      {savedName && <small role="status">Saved to Logs · {savedName}</small>}
      {showExportModal && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-header">
              <h3>Export Packet Logs</h3>
              <button disabled={saving} onClick={() => setShowExportModal(false)} className="modal-close">✕</button>
            </div>

            <div className="modal-body">
              <div className="form-row">
                <label>Format:</label>
                <select
                  value={exportFormat}
                  onChange={(e) => {
                    const format = e.target.value;
                    if (format === 'PCAP' || format === 'CSV' || format === 'JSON') {
                      setExportFormat(format);
                    }
                  }}
                  className="modal-select"
                >
                  {!live && <option value="PCAP">PCAP (.pcap)</option>}
                  <option value="CSV">CSV (.csv)</option>
                  <option value="JSON">JSON (.json)</option>
                </select>
              </div>

              <div className="form-row">
                <label>Range:</label>
                <div className="radio-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label>
                    <input
                      type="radio"
                      name="exportRange"
                      checked={exportRange === 'all'}
                      onChange={() => setExportRange('all')}
                    /> All Packets ({packets.length})
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="exportRange"
                      checked={exportRange === 'filtered'}
                      onChange={() => setExportRange('filtered')}
                    /> Filtered View ({filteredPackets.length})
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="exportRange"
                      checked={exportRange === 'selected'}
                      onChange={() => setExportRange('selected')}
                    /> Selected Packets ({selected.size})
                  </label>
                </div>
              </div>
            </div>

            {exportError && <p role="alert">{exportError}</p>}
            <div className="modal-footer">
              <button disabled={saving} onClick={() => setShowExportModal(false)} className="btn-cancel">Cancel</button>
              <button
                disabled={saving} onClick={handleExport}
                className="btn-export"
              >
                {desktopArchive ? (saving ? 'Saving…' : 'Save archive') : 'Download Export'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
