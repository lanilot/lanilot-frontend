// Spreadsheet export without dependencies: CSV (UTF-8 BOM, opens in Excel) and a minimal real .xlsx.
// columns: [{label, type:'text'|'money'|'int'|'date'|'number'}]; rows: arrays of values in column order.
const esc=v=>String(v).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'');

export function toCSV(columns,rows){
 const cell=v=>{if(v===null||v===undefined)return '';const s=String(v);return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s};
 return '﻿'+[columns.map(c=>c.label),...rows].map(r=>r.map(cell).join(',')).join('\r\n')+'\r\n';
}

const colName=i=>{let s='';for(i++;i>0;i=Math.floor((i-1)/26))s=String.fromCharCode(65+(i-1)%26)+s;return s};
// Excel serial date (1900 system) for an ISO yyyy-mm-dd string.
const serial=iso=>Math.round((Date.UTC(+iso.slice(0,4),+iso.slice(5,7)-1,+iso.slice(8,10))-Date.UTC(1899,11,30))/86400000);
const styleOf={text:0,money:2,int:3,date:4,number:5};

export function toXLSX(columns,rows,{sheetName='Sheet1',totals=[],totalsLabel='Total'}={}){
 const last=rows.length+1;
 const cellXml=(v,col,r)=>{const ref=colName(col)+r,type=columns[col].type||'text';
  if(v===null||v===undefined||v==='')return '';
  if(type==='date'&&/^\d{4}-\d{2}-\d{2}$/.test(v))return `<c r="${ref}" s="4"><v>${serial(v)}</v></c>`;
  if(type!=='text'&&typeof v==='number'&&Number.isFinite(v))return `<c r="${ref}" s="${styleOf[type]}"><v>${v}</v></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`};
 const header=`<row r="1">${columns.map((c,i)=>`<c r="${colName(i)}1" t="inlineStr" s="1"><is><t>${esc(c.label)}</t></is></c>`).join('')}</row>`;
 const body=rows.map((row,ri)=>`<row r="${ri+2}">${row.map((v,ci)=>cellXml(v,ci,ri+2)).join('')}</row>`).join('');
 // Totals row: SUM formulas under the listed columns so the sheet stays correct after edits.
 const totalRow=totals.length&&rows.length?`<row r="${last+1}"><c r="A${last+1}" t="inlineStr" s="1"><is><t>${esc(totalsLabel)}</t></is></c>${totals.map(i=>`<c r="${colName(i)}${last+1}" s="${columns[i].type==='money'?6:7}"><f>SUM(${colName(i)}2:${colName(i)}${last})</f></c>`).join('')}</row>`:'';
 const widths=columns.map((c,i)=>`<col min="${i+1}" max="${i+1}" width="${c.width||Math.max(10,Math.min(40,c.label.length+4))}" customWidth="1"/>`).join('');
 const sheet=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths}</cols><sheetData>${header}${body}${totalRow}</sheetData><autoFilter ref="A1:${colName(columns.length-1)}${last}"/></worksheet>`;
 const styles=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8F0FF"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="8"><xf/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/><xf numFmtId="164" applyNumberFormat="1"/><xf numFmtId="3" applyNumberFormat="1"/><xf numFmtId="14" applyNumberFormat="1"/><xf numFmtId="4" applyNumberFormat="1"/><xf numFmtId="164" fontId="1" fillId="2" applyNumberFormat="1" applyFont="1" applyFill="1"/><xf numFmtId="3" fontId="1" fillId="2" applyNumberFormat="1" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
 const files={
  '[Content_Types].xml':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
  '_rels/.rels':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  'xl/workbook.xml':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${esc(sheetName.slice(0,31).replace(/[\\/?*[\]:]/g,' '))}" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${esc(sheetName.slice(0,31).replace(/[\\/?*[\]:]/g,' '))}'!$A$1:$${colName(columns.length-1)}$${last}</definedName></definedNames></workbook>`,
  'xl/_rels/workbook.xml.rels':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  'xl/styles.xml':styles,
  'xl/worksheets/sheet1.xml':sheet
 };
 return zip(files);
}

// Stored (uncompressed) ZIP container: enough for .xlsx and avoids a compression library.
const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;return c>>>0});
const crc32=bytes=>{let c=0xFFFFFFFF;for(const b of bytes)c=crcTable[(c^b)&0xFF]^(c>>>8);return (c^0xFFFFFFFF)>>>0};
function zip(files){
 const enc=new TextEncoder(),parts=[],central=[];let offset=0;
 const u16=v=>[v&255,(v>>>8)&255],u32=v=>[v&255,(v>>>8)&255,(v>>>16)&255,(v>>>24)&255];
 for(const [name,content] of Object.entries(files)){
  const data=enc.encode(content),fname=enc.encode(name),crc=crc32(data);
  const local=new Uint8Array([...u32(0x04034b50),...u16(20),...u16(0x0800),...u16(0),...u16(0),...u16(0x21),...u32(crc),...u32(data.length),...u32(data.length),...u16(fname.length),...u16(0)]);
  parts.push(local,fname,data);
  central.push(new Uint8Array([...u32(0x02014b50),...u16(20),...u16(20),...u16(0x0800),...u16(0),...u16(0),...u16(0x21),...u32(crc),...u32(data.length),...u32(data.length),...u16(fname.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(offset)]),fname);
  offset+=local.length+fname.length+data.length;
 }
 const size=central.reduce((n,p)=>n+p.length,0),count=Object.keys(files).length;
 const end=new Uint8Array([...u32(0x06054b50),...u16(0),...u16(0),...u16(count),...u16(count),...u32(size),...u32(offset),...u16(0)]);
 const out=new Uint8Array(offset+size+end.length);let at=0;for(const p of [...parts,...central,end]){out.set(p,at);at+=p.length}
 return out;
}

export function download(filename,data,mime){
 const blob=new Blob([data],{type:mime}),a=document.createElement('a');
 a.href=URL.createObjectURL(blob);a.download=filename;document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
