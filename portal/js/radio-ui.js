import { WebSerialTransport,requestSerialPort } from './serial-transport.js';
import { preparePair,validateKit,validatePairing,radioRequest,applyPairing } from './radio.js';
const $=id=>document.getElementById(id);
let transport=null,kit=null,current=null;
function review(){const a=validatePairing(kit.logger),b=validatePairing(kit.receiver);$('pairing-summary').textContent=`Prepared kit: logger ${a.target}, receiver ${b.target}, channel ${a.channel}.`;$('channel').value=a.channel;}
function show(message){$('message').textContent=message;}
async function run(operation){
  document.querySelectorAll('button').forEach(b=>b.disabled=true);
  try{await operation();}catch(error){show(error.message);}
  finally{document.querySelectorAll('button').forEach(b=>b.disabled=false);}
}
async function status(){
  if(!transport)throw new Error('Connect a board first.');
  current=await radioRequest(transport,'RADIO STATUS','RADIO_STATUS');
  let details=Object.entries(current).map(([k,v])=>`${k}: ${v}`).join('\n');
  if(current.role==='receiver') {
    const readings=await radioRequest(transport,'RECEIVER STATUS','RECEIVER_STATUS');
    details+='\n\nReadings\n'+Object.entries(readings).map(([k,v])=>`${k}: ${v}`).join('\n');
  }
  $('status').textContent=details;
  if(current.role==='logger')$('logger').value=current.mac;
  if(current.role==='receiver')$('receiver').value=current.mac;
  return current;
}
$('connect').onclick=()=>run(async()=>{
  if(transport)await transport.close(); transport=null; current=null;
  const candidate=new WebSerialTransport(await requestSerialPort());
  try{await candidate.open();transport=candidate;await status();show('Connected. Pairing is unchanged.');}
  catch(error){await candidate.close();transport=null;throw error;}
});
$('disconnect').onclick=()=>run(async()=>{if(transport)await transport.close();transport=null;current=null;show('Disconnected.');});
$('refresh').onclick=()=>run(status);
$('prepare').onclick=()=>run(async()=>{kit=preparePair($('logger').value,$('receiver').value,Number($('channel').value));$('saved').checked=false;review();show('Pairing prepared in memory. Save the private recovery kit before applying it to either board.');});
$('export').onclick=()=>run(async()=>{
  if(!kit)throw new Error('Prepare or import a pairing kit first.');
  const url=URL.createObjectURL(new Blob([JSON.stringify(kit,null,2)+'\n'],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='saunan-private-pairing.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  show('Recovery kit download requested. Keep it private and available offline.');
});
$('import').onchange=()=>run(async()=>{
  const file=$('import').files[0];if(!file)return;
  if(file.size>8192)throw new Error('Pairing kit is too large.');
  kit=validateKit(JSON.parse(await file.text()));$('logger').value=kit.logger.target_mac;$('receiver').value=kit.receiver.target_mac;
  $('saved').checked=true;review();show('Recovery kit validated. Select either board and apply its matching configuration.');
});
$('apply').onclick=()=>run(async()=>{
  if(!kit||!$('saved').checked)throw new Error('Save the recovery kit and confirm it is available before applying.');
  await status(); const config=kit[current.role];if(!config)throw new Error('Unknown board role; install current firmware.');
  await applyPairing(transport,config);await status();
  show('Pairing saved and read back. Reboot this board, then configure the other board with the same kit. Recording must be stopped before reboot.');
});
$('reboot').onclick=()=>run(async()=>{
  if(!transport)throw new Error('Connect a board first.');
  await radioRequest(transport,'RADIO REBOOT','RADIO_REBOOT');await transport.close();transport=null;current=null;
  show('Reboot requested. Reconnect and refresh status: active should be 1, fault 0. Verify live readings on the receiver after both boards are configured.');
});
$('recover').onclick=()=>run(async()=>{
  if(!transport)throw new Error('Connect a board first.');
  const result=await radioRequest(transport,'RADIO RECOVER','RADIO_RECOVER');if(result.ok!=='1')throw new Error('Radio recovery unavailable; check pairing and firmware.');
  show('Radio-only recovery requested. Recording continues. Refresh status in a few seconds.');
});
