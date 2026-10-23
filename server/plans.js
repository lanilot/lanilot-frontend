// Subscription plans. Prices are monthly USD; billing is recorded manually until Stripe (stage 5) is connected.
export const PLANS={
 trial:{name:'Trial',price:0,trucks:5,users:3},
 starter:{name:'Starter',price:49,trucks:10,users:5},
 pro:{name:'Pro',price:149,trucks:50,users:20},
 enterprise:{name:'Enterprise',price:399,trucks:null,users:null}
};
export const TRIAL_DAYS=14;
export const trialEnd=c=>c.trial_ends_at||new Date(Date.parse(c.created_at)+TRIAL_DAYS*86400000).toISOString();
// Monthly recurring revenue of a company: paid plans of active, non-internal companies.
export const companyMrr=c=>c.status==='active'&&!c.internal?PLANS[c.plan]?.price??0:0;
