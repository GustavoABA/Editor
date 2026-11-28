import type { StickerItem, StickerProvider } from "@/stickers/types";
const KEY = "opencut-saved-png-stickers-v1";
type Saved = {id:string; name:string; url:string};
function load(): Saved[] {
  if(typeof window==="undefined") return [];
  try {const data:unknown=JSON.parse(localStorage.getItem(KEY)||"[]");return Array.isArray(data)?data.filter((v):v is Saved=>!!v&&typeof v.id==="string"&&typeof v.name==="string"&&typeof v.url==="string"&&v.url.startsWith("data:image/png;base64,")):[];}catch{return [];}
}
function save(items:Saved[]) {
  const data=JSON.stringify(items);
  if(data.length>4_000_000) throw Error("Biblioteca de PNGs cheia (4 MB por navegador). Remova uma figurinha ou use uma imagem menor.");
  localStorage.setItem(KEY,data);
}
function toItem(v:Saved):StickerItem {
  return {id:v.id,provider:"saved",name:v.name,previewUrl:v.url,metadata:{}};
}
export async function savePngSticker(file:File) {
  if(file.type!=="image/png" && !/\.png$/i.test(file.name)) throw Error("Selecione uma imagem PNG.");
  const bytes=new Uint8Array(await file.slice(0,8).arrayBuffer());
  if(bytes.join(",")!=="137,80,78,71,13,10,26,10")throw Error("Arquivo PNG inválido.");
  if(file.size>2_000_000)throw Error("PNG acima de 2 MB. Reduza o tamanho antes de salvar.");
  const url=await new Promise<string>((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>typeof reader.result==="string"?resolve(reader.result.replace(/^data:[^;]*;/,"data:image/png;")):reject(Error("Falha ao ler PNG."));
    reader.onerror=()=>reject(Error("Falha ao ler PNG."));
    reader.readAsDataURL(file);
  });
  const existing=load();if(existing.some(v=>v.url===url))return;
  save([{id:"saved:"+Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,"0")).join(""),name:file.name.replace(/\.png$/i,""),url},...existing]);
}
export function removePngSticker(id:string){save(load().filter(v=>v.id!==id));}
export const savedProvider:StickerProvider={
  id:"saved",
  async search({query,options}){const matches=load().filter(v=>v.name.toLowerCase().includes(query.toLowerCase()));const limit=options?.limit??100;return {items:matches.slice(0,limit).map(toItem),total:matches.length,hasMore:matches.length>limit};},
  async browse(){return {sections:[{id:"saved-png",title:"Figurinhas PNG salvas neste navegador",items:load().map(toItem),layout:"grid"}]};},
  resolveUrl({stickerId}){const found=load().find(v=>v.id===stickerId);if(!found)throw Error("Figurinha PNG não está disponível neste navegador.");return found.url;},
};

/** Keep the existing PNG library format and alpha channel for other image formats. */
export async function saveImageSticker({ file }: { file: File }) {
	if (file.type === "image/png" || /\.png$/i.test(file.name)) {
		return savePngSticker(file);
	}
	const image = await createImageBitmap(file);
	try {
		const scale = Math.min(1, 1024 / Math.max(image.width, image.height));
		const canvas = document.createElement("canvas");
		canvas.width = Math.max(1, Math.round(image.width * scale));
		canvas.height = Math.max(1, Math.round(image.height * scale));
		const context = canvas.getContext("2d");
		if (!context) throw Error("Não foi possível converter a imagem.");
		context.drawImage(image, 0, 0, canvas.width, canvas.height);
		const blob = await new Promise<Blob>((resolve, reject) => {
			canvas.toBlob((value) => value ? resolve(value) : reject(Error("Falha ao converter para PNG.")), "image/png");
		});
		await savePngSticker(new File([blob], file.name.replace(/\.[^.]+$/, "") + ".png", { type: "image/png" }));
	} finally {
		image.close();
	}
}
