import { crc32 } from './log-management.js';

export function normalizeMac(value) {
  const hex=String(value).replace(/[:-]/g,'').toUpperCase();
  if(!/^[0-9A-F]{12}$/.test(hex) || /^0+$/.test(hex) || (parseInt(hex.slice(0,2),16)&1)) throw new Error('A valid unicast MAC address is required.');
  return hex;
}
const hexOf=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const bytesOf=hex=>Uint8Array.from(hex.match(/../g),b=>parseInt(b,16));

export function preparePair(loggerMac,receiverMac,channel,random=globalThis.crypto) {
  const logger=normalizeMac(loggerMac),receiver=normalizeMac(receiverMac);
  if(logger===receiver) throw new Error('Choose two different boards.');
  if(!Number.isInteger(channel)||channel<1||channel>11) throw new Error('Choose channel 1–11.');
  const pmk=random.getRandomValues(new Uint8Array(16)),lmk=random.getRandomValues(new Uint8Array(16));
  if(!pmk.some(Boolean)||!lmk.some(Boolean)) throw new Error('Key generation failed.');
  const document=(role,target,peer)=>{
    const raw=new Uint8Array(60),view=new DataView(raw.buffer);
    raw.set([83,82,65,68,1,1,channel,0]);
    view.setBigUint64(8,BigInt('0x'+logger),true);
    raw.set(bytesOf(peer),16);raw.set(pmk,24);raw.set(lmk,40);
    view.setUint32(56,crc32(raw.slice(0,56)),true);
    return {schema:'saunan.pairing.v1',role,target_mac:target,config_hex:hexOf(raw)};
  };
  return {schema:'saunan.pairing-kit.v1',logger:document('logger',logger,receiver),receiver:document('receiver',receiver,logger)};
}
export function validatePairing(document) {
  if(document?.schema!=='saunan.pairing.v1'||!['logger','receiver'].includes(document.role)||! /^[0-9a-fA-F]{120}$/.test(document.config_hex)) throw new Error('Unsupported pairing file.');
  const target=normalizeMac(document.target_mac),raw=bytesOf(document.config_hex),view=new DataView(raw.buffer);
  if(hexOf(raw.slice(0,6))!=='535241440101'||raw[6]<1||raw[6]>11||raw[7]||raw[22]||raw[23]||view.getUint32(56,true)!==crc32(raw.slice(0,56))) throw new Error('Pairing checksum or configuration is invalid.');
  const peer=normalizeMac(hexOf(raw.slice(16,22))),source=view.getBigUint64(8,true);
  if(peer===target||!raw.slice(24,40).some(Boolean)||!raw.slice(40,56).some(Boolean)||source!==BigInt('0x'+(document.role==='logger'?target:peer))) throw new Error('Pairing identities or keys are invalid.');
  return {target,peer,channel:raw[6],role:document.role,raw};
}
export function validateKit(kit) {
  if(kit?.schema!=='saunan.pairing-kit.v1') throw new Error('Choose a pairing kit.');
  const a=validatePairing(kit.logger),b=validatePairing(kit.receiver);
  if(a.role!=='logger'||b.role!=='receiver'||a.target!==b.peer||b.target!==a.peer||a.channel!==b.channel||hexOf(a.raw.slice(24,56))!==hexOf(b.raw.slice(24,56))) throw new Error('The two pairing files do not match.');
  return kit;
}
export async function radioRequest(transport,command,prefix) {
  return transport.runExclusive(async()=>{
    await transport.drainInputUntilQuiet();
    await transport.writeLine(command);
    const deadline=Date.now()+8000;
    while(Date.now()<deadline) {
      const record=await transport.readRecord(deadline-Date.now());
      if(record.error) throw new Error('Malformed serial response.');
      const [name,...parts]=record.line.trim().split(/\s+/);
      if(name==='RADIO_ERROR') throw new Error('Device rejected the operation: '+parts.join(' '));
      if(name!==prefix) continue;
      const fields={};
      for(const part of parts) { const match=/^([a-z_]+)=([^\s=]+)$/.exec(part);if(!match||Object.hasOwn(fields,match[1])) throw new Error('Invalid radio response.');fields[match[1]]=match[2]; }
      return fields;
    }
    throw new Error('No response. Configuration outcome may be uncertain; reconnect and inspect status.');
  });
}
export async function applyPairing(transport,document) {
  const config=validatePairing(document);
  const status=await radioRequest(transport,'RADIO STATUS','RADIO_STATUS');
  if(status.protocol!=='1'||normalizeMac(status.mac)!==config.target||status.role!==config.role) throw new Error('Connected board identity or role does not match. Use current firmware.');
  if(status.restart_required!=='0'||status.recovering==='1') throw new Error('Finish reboot or radio recovery before applying pairing.');
  const result=await radioRequest(transport,'RADIO '+document.config_hex,'RADIO_CONFIG');
  if(result.ok!=='1'||result.restart_required!=='1') throw new Error('Pairing write was not verified. Inspect status before retrying.');
  return result;
}
