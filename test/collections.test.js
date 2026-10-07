import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeCollection,collectionResponse} from '../worker/collections.js';
const c={v:1,name:'A curious weekend',items:[{id:'w123',lang:'en',title:'Mountains & sea',body:'A place to explore.'}]};
const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
test('collection snapshot round trips Unicode',()=>assert.deepEqual(decodeCollection(encode({...c,name:'Café & coast'})),{...c,name:'Café & coast'}));
test('collection rejects external URLs, malformed IDs and oversized links',()=>{assert.throws(()=>decodeCollection(encode({...c,items:[{...c.items[0],id:'https://evil.test'}]})));assert.throws(()=>decodeCollection('x'.repeat(12001)));assert.throws(()=>decodeCollection(encode({...c,items:[]})));});
test('collection image serves a prebuilt PNG without source lookups or runtime rendering',async()=>{
 let calls=0;const env={ASSETS:{fetch:async request=>{calls++;assert.equal(new URL(request.url).pathname,'/images/og-collection-v1.png');return new Response(new Uint8Array([137,80,78,71]));}}};
 const response=await collectionResponse(new Request('https://wikiscroll.com/collection.png?c='+encode({...c,name:'<img>'})),{},env);
 assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),'image/png');assert.equal(calls,1);assert.equal((await response.arrayBuffer()).byteLength,4);
});
test('invalid shared collection returns 400, HEAD returns no body',async()=>{assert.equal((await collectionResponse(new Request('https://wikiscroll.com/collection?c=bad'),{})).status,400);const res=await collectionResponse(new Request('https://wikiscroll.com/collection?c='+encode(c),{method:'HEAD'}),{});assert.equal(await res.text(),'');});
