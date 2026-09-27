import {isObject, isId, byte, result, issue} from "./common.mjs";
export const validDeviceId = value => typeof value === "string" && /^[a-z0-9_-]{3,120}$/.test(value);
const integerRange = (value,min,max) => Number.isInteger(value) && value>=min && value<=max;
const flagsValid = value => isObject(value) && Object.keys(value).length<=32 &&
  Object.entries(value).every(([key,flag])=>/^[a-z][a-zA-Z0-9]{0,39}$/.test(key)&&typeof flag==="boolean");

export function validateDeviceSettings(value) {
  const errors=[];
  const check=(ok,path,message)=>{if(!ok)issue(errors,path,message);};
  if(!isObject(value)) return result([{path:"deviceConfig",message:"Missing settings"}]);
  check(integerRange(value.pollIntervalSeconds,5,300),"pollIntervalSeconds","Expected integer 5..300");
  check(integerRange(value.statusIntervalSeconds,300,900),"statusIntervalSeconds","Expected integer 300..900");
  check(byte(value.brightnessLimit),"brightnessLimit","Expected integer 0..255");
  check(typeof value.otaEnabled==="boolean","otaEnabled","Expected boolean");
  check(flagsValid(value.featureFlags),"featureFlags","Expected at most 32 named boolean flags");
  return result(errors);
}
export function validateDeviceConfig(value) {
  const errors=[];
  if(!isObject(value))return result([{path:"config",message:"Expected object"}]);
  const check=(ok,path,message)=>{if(!ok)issue(errors,path,message);};
  check(value.schemaVersion===1,"schemaVersion","Expected DeviceConfig v1");
  check(validDeviceId(value.deviceId),"deviceId","Invalid device ID");
  check(isId(value.boardProfile),"boardProfile","Invalid board profile");
  check(isId(value.hardwareProfile),"hardwareProfile","Invalid hardware profile");
  errors.push(...validateDeviceSettings(value).errors);
  for(const key of ["frameUrl","otaManifestUrl"]) {
    let valid=false;
    try {
      const url=new URL(value[key]);
      const expected=key==="frameUrl"?"/api/v1/frame/"+value.boardProfile:"/api/v1/ota/"+value.deviceId;
      valid=url.protocol==="https:"&&!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname===expected;
    } catch {}
    check(valid,key,"Expected HTTPS v1 URL without credentials/query");
  }
  return result(errors);
}
// Allowlist projection: never spread registry records, tokens or arbitrary fields.
export function buildDeviceConfig(registration, origin) {
  const settings=registration.deviceConfig;
  return {
    schemaVersion:1,deviceId:registration.deviceId,boardProfile:registration.boardProfile,
    hardwareProfile:registration.hardwareProfile,
    frameUrl:origin+"/api/v1/frame/"+registration.boardProfile,
    pollIntervalSeconds:settings?.pollIntervalSeconds,
    statusIntervalSeconds:settings?.statusIntervalSeconds,
    brightnessLimit:settings?.brightnessLimit,otaEnabled:settings?.otaEnabled,
    otaManifestUrl:origin+"/api/v1/ota/"+registration.deviceId,
    featureFlags:settings?.featureFlags
  };
}
