import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  authenticate, verifyOrbitActionToken, verifyOrbitToken,
} from '../worker/src/identity.ts';
import { siteAction } from '../worker/src/orbit-eylem.ts';
import { orbitHttpForEnvironment } from '../worker/src/orbit-http.ts';

const issuer='https://orbit-v6-staging.samett33710.workers.dev';
const audience='orbit-haber-staging';
const stageEnv={ORBIT_ISSUER:issuer,ORBIT_AUDIENCE:audience};

const b64=value=>Buffer.from(value instanceof Uint8Array?value:typeof value==='string'?value:JSON.stringify(value)).toString('base64url');

test('staging action ES256 verification uses exact service-binding JWKS, not public fetch',async()=>{
  const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);
  const kid='synthetic-cp35-p256-verified';
  const calls=[];
  const service={
    async fetch(request){
      const url=new URL(request.url);
      calls.push({host:url.host,path:url.pathname,redirect:request.redirect});
      if(url.pathname==='/.well-known/openid-configuration'){
        return Response.json({issuer,jwks_uri:issuer+'/.well-known/jwks.json'});
      }
      if(url.pathname==='/.well-known/jwks.json'){
        return Response.json({keys:[{...jwk,kid,alg:'ES256',use:'sig'}]});
      }
      throw new Error('unapproved_stage_binding_path');
    },
  };
  const transport=orbitHttpForEnvironment({...stageEnv,ORBIT_STAGING:service});
  const now=Math.floor(Date.now()/1000);
  const sign=async claims=>{
    const data=b64({alg:'ES256',kid,typ:'JWT'})+'.'+b64(claims);
    const signature=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},
      pair.privateKey,new TextEncoder().encode(data));
    return data+'.'+b64(Buffer.from(signature));
  };
  const action=await sign({
    iss:issuer,aud:audience,sub:'synthetic-pairwise-human',scope:'site.actions',
    act:{sub:'agent:synthetic-reader',handle:'reader'},
    operation:'haber.haberleriOku',iat:now,exp:now+60,
  });
  const accepted=await verifyOrbitActionToken(action,issuer,audience,transport);
  assert.deepEqual(accepted,{
    subject:'synthetic-pairwise-human',actorSubject:'agent:synthetic-reader',
    actorHandle:'reader',operation:'haber.haberleriOku',
  });
  assert.deepEqual(calls.map(x=>x.path),[
    '/.well-known/openid-configuration','/.well-known/jwks.json',
  ]);
  assert.ok(calls.every(x=>x.host==='orbit-v6-staging.samett33710.workers.dev'&&x.redirect==='manual'));
  const human=await sign({iss:issuer,aud:audience,sub:'synthetic-person',iat:now,exp:now+300});
  assert.deepEqual(await verifyOrbitToken(human,issuer,audience,transport),{
    subject:'synthetic-person',
  });
  const wrongAud=await sign({iss:issuer,aud:'orbit-haber',sub:'synthetic-person',iat:now,exp:now+300});
  const denied=await verifyOrbitToken(wrongAud,issuer,audience,transport);
  assert.equal(denied.status,401);
  assert.match(denied.error,/bu site için verilmemiş/u);
  const idFromAction=await verifyOrbitToken(action,issuer,audience,transport);
  assert.equal(idFromAction.status,401);
});

test('missing stage binding and mismatched audiences are rejected without network access',()=>{
  assert.throws(()=>orbitHttpForEnvironment(stageEnv),/staging_orbit_service_binding_missing/u);
  assert.throws(()=>orbitHttpForEnvironment({
    ...stageEnv,ORBIT_CLIENT_ID:'orbit-haber',ORBIT_STAGING:{fetch:async()=>Response.json({})},
  }),/staging_orbit_service_binding_missing/u);
  assert.throws(()=>orbitHttpForEnvironment({
    ...stageEnv,ORBIT_AUDIENCE:'orbit-haber',
    ORBIT_STAGING:{fetch:async()=>Response.json({})},
  }),/staging_orbit_service_binding_missing/u);
});


test('missing stage JWKS service returns 503 on API action and legacy auth, never public fetch',async()=>{
  const DB={prepare(){throw new Error('missing stage binding must not access D1');}};
  const env={DB,ORBIT_ISSUER:issuer,ORBIT_AUDIENCE:audience};
  const auth=await authenticate(new Request('https://haber-site-staging.samett33710.workers.dev/api/brief',{
    headers:{authorization:'Bearer synthetic.test.signature'},
  }),env);
  assert.equal(auth.ok,false);
  assert.equal(auth.status,503);

  const action=await siteAction(new Request('https://haber-site-staging.samett33710.workers.dev/api/orbit-eylem',{
    method:'POST',
    headers:{authorization:'Bearer synthetic.test.signature','content-type':'application/json',
      'idempotency-key':'synthetic-stage-jwks-negative-test'},
    body:JSON.stringify({operationId:'haber.haberleriOku',input:{limit:1}}),
  }),env);
  assert.equal(action.status,503);
  assert.ok(!(await action.text()).includes('synthetic.test.signature'));
});
