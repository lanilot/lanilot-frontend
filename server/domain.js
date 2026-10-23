export function calculateProfit(rate, miles, deadhead, costs) {
  const values = [rate,miles,deadhead,costs.fuelPrice,costs.mpg,costs.driverPerMile,costs.tolls,costs.other,costs.factoringPercent];
  if(values.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0)||costs.mpg===0||costs.factoringPercent>100) throw new Error('Проверьте расходы и ставку');
  const totalMiles=miles+deadhead;
  const fuel=totalMiles/costs.mpg*costs.fuelPrice;
  const driver=totalMiles*costs.driverPerMile;
  const factoring=rate*costs.factoringPercent/100;
  const expenses=fuel+driver+factoring+costs.tolls+costs.other;
  return {totalMiles,fuel,driver,factoring,expenses,profit:rate-expenses,rpm:totalMiles?rate/totalMiles:0,margin:rate?(rate-expenses)/rate*100:0};
}
export const defaultCosts={fuelPrice:3.85,mpg:6.8,driverPerMile:0.75,tolls:45,other:75,factoringPercent:2.5};
// Driver pay is per driver when set in the fleet; otherwise the company rate from settings applies.
export function costsForDriver(costs,driver){const pay=Number(driver?.pay_per_mile);return Number.isFinite(pay)&&pay>0&&driver?.pay_per_mile!==null?{...costs,driverPerMile:pay}:costs;}
export const transitions={planned:['in_transit'],in_transit:['delivered'],delivered:['completed'],completed:[],cancelled:[]};
export function canTransition(from,to){return transitions[from]?.includes(to)??false;}
export function brokerDraft(load,rate){return `Hello ${load.broker} team,\n\nIs your ${load.equipment} load from ${load.origin} to ${load.destination} still available for ${load.pickup}?\n\nCan you do $${rate.toLocaleString('en-US')} all-in? Please confirm the pickup and delivery appointments, commodity, and any additional requirements.\n\nThis is a rate inquiry, not a booking commitment.\n\nThank you,\nLanilot Dispatch`;}
