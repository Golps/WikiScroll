// Confirm the upload was followed by an active, full-traffic deployment.
export function activeVersion(data, since) {
  const deployment=data?.result?.deployments?.[0];
  const versions=deployment?.versions;
  if(!data?.success || !Number.isFinite(Date.parse(since)) || !Number.isFinite(Date.parse(deployment?.created_on)) || Date.parse(deployment.created_on)<Date.parse(since) || versions?.length!==1 || versions[0].percentage!==100 || !versions[0].version_id) {
    throw new Error('No new full-traffic deployment could be confirmed. Check the Worker deployment history.');
  }
  return versions[0].version_id;
}
if(process.argv[1] && import.meta.url===new URL(process.argv[1],'file:').href){
  try{
    const {CLOUDFLARE_API_TOKEN:token,CLOUDFLARE_ACCOUNT_ID:account}=process.env;
    if(!token||!account)throw Error('Deployment credentials are missing.');
    const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/wikiscroll/deployments`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error(`Deployment verification returned HTTP ${response.status}.`);
    const version=activeVersion(await response.json(),process.argv[2]);
    console.log(`Deployed. Live version: ${version} (100%)`);
  }catch(error){console.error(error.message);process.exitCode=1;}
}
