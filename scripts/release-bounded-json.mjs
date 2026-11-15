/**
 * A public release smoke check must not allocate arbitrary response bodies:
 * either endpoint may be broken, misrouted or unexpectedly serve HTML.
 * Inspect real stream bytes before UTF-8 decoding or JSON.parse.
 */
export async function readReleaseJson(response, maxBytes){
  if(!Number.isSafeInteger(maxBytes) || maxBytes<1){
    throw new Error('Invalid release response budget');
  }
  const contentLength=response.headers.get('content-length');
  if(contentLength!==null
    && (!/^\d+$/u.test(contentLength) || Number(contentLength)>maxBytes)){
    await response.body?.cancel().catch(()=>undefined);
    throw new Error('Release response exceeds allowed size');
  }

  const reader=response.body?.getReader();
  if(!reader)throw new Error('Release response body is empty');
  let length=0;
  const chunks=[];
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      length+=value.byteLength;
      if(length>maxBytes){
        await reader.cancel().catch(()=>undefined);
        throw new Error('Release response exceeds allowed size');
      }
      chunks.push(value);
    }
  }catch(error){
    if(error instanceof Error && error.message==='Release response exceeds allowed size')throw error;
    throw new Error('Release response stream could not be read');
  }
  const bytes=new Uint8Array(length);
  let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  try{
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  }catch{
    // A parse exception may include raw response fragments. Release error
    // logs must never echo unexpected upstream body content.
    throw new Error('Release response contains invalid UTF-8 or JSON');
  }
}
