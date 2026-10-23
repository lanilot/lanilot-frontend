import test from 'node:test';
import assert from 'node:assert/strict';
import {withMinimumLoading,SKELETON_DELAY_MS} from '../src/loading-config.js';
test('loading holds quick success and failure for the configured minimum without swallowing errors',async()=>{
 const started=performance.now(),error=new Error('offline');
 const [success,failure]=await Promise.allSettled([withMinimumLoading(()=>42),withMinimumLoading(()=>{throw error})]);
 assert.equal(SKELETON_DELAY_MS,3000);
 assert.ok(performance.now()-started>=SKELETON_DELAY_MS-15);
 assert.deepEqual(success,{status:'fulfilled',value:42});
 assert.equal(failure.status,'rejected');assert.equal(failure.reason,error);
});
