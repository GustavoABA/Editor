export const MAX_MEDIA_BYTES = 32 * 1024 * 1024;
export const MAX_CONFIGURED_MEDIA_BYTES = 128 * 1024 * 1024;
export function mediaLimit(value:unknown){
  const mib=Number(value);
  return Number.isInteger(mib)&&mib>=1&&mib<=128?mib*1024*1024:MAX_MEDIA_BYTES;
}
export function needsEditingProxy(mime:string,size:number){return mime==="audio/ogg"||mime==="audio/webm"||size>24*1024*1024&&mime!=="image/gif";}
export const MAX_INBOX_BYTES = 1024 * 1024 * 1024;
export const INSTANCE = "cut-editor";
export const MIME_EXTENSIONS: Record<string,string> = {
  "image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/gif":"gif",
  "video/mp4":"mp4","video/webm":"webm",
  "audio/ogg":"ogg","audio/mpeg":"mp3","audio/mp4":"m4a","audio/aac":"aac","audio/wav":"wav","audio/webm":"webm","audio/flac":"flac",
};
export function phone(value: unknown): string | null {
  if (typeof value !== "string" || !/^[+0-9 ()-]{8,25}$/.test(value)) return null;
  const number=value.replace(/\D/g,"");
  return /^[1-9]\d{7,14}$/.test(number)?number:null;
}
export function validProject(value: unknown): value is string {
  return typeof value==="string" && !["__proto__","constructor","prototype"].includes(value) && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
}
export function record(value: unknown): value is Record<string,unknown> {
  return !!value && typeof value==="object" && !Array.isArray(value);
}
export function incoming(payload: unknown, maxBytes=MAX_MEDIA_BYTES) {
  if (!record(payload) || payload.instance!==INSTANCE || typeof payload.event!=="string" ||
      payload.event.toLowerCase().replace(/_/g,".")!=="messages.upsert" || !record(payload.data)) return null;
  const d=payload.data;
  if (!record(d.key) || d.key.fromMe!==false || !record(d.message)) return null;
  const key=d.key;
  // Fail closed for groups, status, broadcasts and unresolved WhatsApp LIDs.
  const jid=typeof key.remoteJid==="string"?key.remoteJid:"";
  const alt=typeof key.remoteJidAlt==="string"?key.remoteJidAlt:"";
  const match=/^(\d{8,15})@s\.whatsapp\.net$/.exec(jid) ??
    (/^\d+@lid$/.test(jid)?/^(\d{8,15})@s\.whatsapp\.net$/.exec(alt):null);
  if (!match || typeof key.id!=="string" || !/^[a-zA-Z0-9_-]{1,160}$/.test(key.id)) return null;
  const message=d.message;
  const kinds=["imageMessage","videoMessage","audioMessage","documentMessage","stickerMessage"];
  const kind=kinds.find(k=>record(message[k]));
  if (!kind) return null;
  const media=message[kind] as Record<string,unknown>;
  const mime=typeof media.mimetype==="string"?media.mimetype.split(";")[0].toLowerCase():kind==="stickerMessage"?"image/webp":"";
  if (!Object.prototype.hasOwnProperty.call(MIME_EXTENSIONS,mime)) return null;
  const length=Number(media.fileLength);
  if (Number.isFinite(length) && length>maxBytes) return null;
  const timestamp=Number(d.messageTimestamp);
  if (!Number.isFinite(timestamp) || timestamp<=0) return null;
  return {sender:match[1],messageId:key.id,key,message,mime,timestamp:timestamp*1000};
}
