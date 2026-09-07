import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {preparePair,validatePairing,validateKit,applyPairing} from '../../portal/js/radio.js';
const random={getRandomValues(a){a.fill(17);return a;}};
test('pairing encodes exact shared config and validates both identities',()=>{
 const kit=preparePair('02:00:00:00:00:01','02:00:00:00:00:02',6,random);
 assert.equal(kit.logger.config_hex.length,120);
 assert.equal(validatePairing(kit.logger).peer,'020000000002');
 assert.equal(validatePairing(kit.receiver).peer,'020000000001');
 assert.equal(validateKit(kit),kit);
 const corrupt=structuredClone(kit);corrupt.logger.config_hex='00'+corrupt.logger.config_hex.slice(2);
 assert.throws(()=>validateKit(corrupt));
 const mismatch=preparePair('020000000001','020000000003',6,random);
 assert.throws(()=>validateKit({...kit,receiver:mismatch.receiver}));
 assert.throws(()=>preparePair('020000000001','020000000001',6,random));
 assert.throws(()=>preparePair('030000000001','020000000002',6,random));
 assert.throws(()=>preparePair('020000000001','020000000002',12,random));
});
function fake(lines){const writes=[];return {writes,runExclusive:f=>f(),drainInputUntilQuiet:async()=>{},writeLine:async l=>writes.push(l),readRecord:async()=>({line:lines.shift()})};}
test('wrong role or identity prevents pairing write',async()=>{
 const kit=preparePair('020000000001','020000000002',6,random);
 for(const response of ['mac=020000000003 role=logger','mac=020000000001 role=receiver']){
  const port=fake(['RADIO_STATUS protocol=1 restart_required=0 '+response]);
  await assert.rejects(applyPairing(port,kit.logger));assert.deepEqual(port.writes,['RADIO STATUS']);
 }
});
test('matching target requires verified NVS acknowledgment',async()=>{
 const kit=preparePair('020000000001','020000000002',6,random);
 const status='RADIO_STATUS protocol=1 mac=020000000001 role=logger restart_required=0';
 const port=fake([status,'RADIO_CONFIG ok=1 restart_required=1']);
 await applyPairing(port,kit.logger);assert.equal(port.writes[1],'RADIO '+kit.logger.config_hex);
 await assert.rejects(applyPairing(fake([status,'RADIO_CONFIG ok=0 restart_required=1']),kit.logger));
 await assert.rejects(applyPairing(fake([status,'RADIO_ERROR active_session']),kit.logger));
});

test('browser pairing documents are accepted by the offline Python reader',()=>{
 const kit=preparePair('020000000001','020000000002',6,random);
 const code=`import sys,json,tempfile
from pathlib import Path
sys.path.insert(0,'tools')
import pair_radio
kit=json.load(sys.stdin)
with tempfile.TemporaryDirectory() as d:
 for role in ['logger','receiver']:
  p=Path(d)/(role+'.json');p.write_text(json.dumps(kit[role]));mac,raw=pair_radio.load_pairing(p);assert len(raw)==60
`;
 const result=spawnSync('python3',['-c',code],{input:JSON.stringify(kit),encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
});
