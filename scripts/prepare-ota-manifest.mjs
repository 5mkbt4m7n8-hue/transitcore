import fs from 'node:fs';
import crypto from 'node:crypto';
import {selectOtaRelease} from '../worker/device-diagnostics.mjs';
// Metadata must describe the SAME device-specific sketch used for this binary.
// Output contains no Wi-Fi or device credentials. Never publish the binary in git.
const [binaryPath,metadataPath]=process.argv.slice(2);
if(!binaryPath||!metadataPath)throw Error('Usage: node scripts/prepare-ota-manifest.mjs application.ino.bin release.json');
const binary=fs.readFileSync(binaryPath);
if(binary[0]!==0xe9)throw Error('Expected an ESP application image (.ino.bin), not ZIP or merged flash image');
const metadata=JSON.parse(fs.readFileSync(metadataPath,'utf8'));
if(binary.length<36 || binary.readUInt32LE(32)!==0xabcd5432)
 throw Error('Expected application descriptor. Do not use bootloader or merged firmware images.');
const imageChip={0:'esp32',9:'esp32s3'}[binary.readUInt16LE(12)];
if(imageChip!==metadata.chip)throw Error('Binary chip does not match release metadata');
if(metadata.url?.includes('?'))throw Error('Use a stable HTTPS firmware URL without credentials in its query');
const release={...metadata,size:binary.length,md5:crypto.createHash('md5').update(binary).digest('hex')};
const headers=new Headers({'x-transitcore-firmware':'0.0.0','x-transitcore-chip':release.chip,
 'x-transitcore-gpio':String(release.gpio),'x-transitcore-leds':String(release.ledCount),'x-transitcore-physical-leds':String(release.physicalLedCount)});
const devices={[release.deviceId]:release};
const checked=selectOtaRelease({devices},release.deviceId,release.boardProfile,headers);
if(!checked)throw Error('Invalid release target');
process.stdout.write(JSON.stringify({devices:{[release.deviceId]:checked}},null,2)+'\n');
