export const SKELETON_DELAY_MS=750;
export async function withMinimumLoading(work){const [result]=await Promise.allSettled([typeof work==='function'?Promise.resolve().then(work):work,new Promise(resolve=>setTimeout(resolve,SKELETON_DELAY_MS))]);if(result.status==='rejected')throw result.reason;return result.value}
