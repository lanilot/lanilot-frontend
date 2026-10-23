export function seedLoads(){
 const day=(n)=>{const d=new Date();d.setDate(d.getDate()+n);return d.toISOString().slice(0,10)};
 return [
 ['Chicago, IL','Dallas, TX','Dry Van',2450,925,24,42000,53,'C.H. Robinson','DAT','approved',0,'08:00 – 12:00'],
 ['Chicago, IL','Atlanta, GA','Reefer',2850,716,18,38500,53,'Arrive Logistics','Truckstop','approved',0,'10:00 – 14:00'],
 ['Joliet, IL','Memphis, TN','Dry Van',1720,540,38,44000,53,'RXO','RXO','approved',0,'13:00 – 16:00'],
 ['Chicago, IL','Denver, CO','Dry Van',2700,1004,12,40500,53,'J.B. Hunt','J.B. Hunt','unknown',1,'07:00 – 10:00'],
 ['Gary, IN','Houston, TX','Flatbed',3650,1087,42,46000,48,'TQL','Truckstop','approved',1,'09:00 – 13:00'],
 ['Chicago, IL','Nashville, TN','Reefer',2100,473,31,36500,53,'Echo Global','DAT','approved',0,'15:00 – 18:00'],
 ['Dallas, TX','Phoenix, AZ','Dry Van',2300,1064,22,41000,53,'Schneider','Schneider','unknown',1,'08:00 – 11:00'],
 ['Atlanta, GA','Charlotte, NC','Dry Van',1050,245,14,32000,53,'C.H. Robinson','DAT','approved',0,'11:00 – 14:00'],
 ['Chicago, IL','Indianapolis, IN','Box Truck',680,184,16,8500,26,'Spot Freight','Truckstop','approved',0,'12:00 – 15:00'],
 ['Milwaukee, WI','Detroit, MI','Dry Van',1450,373,65,39500,53,'Nolan Transportation','DAT','declined',1,'09:00 – 12:00'],
 ['Chicago, IL','Columbus, OH','Dry Van',1550,360,9,41500,53,'Uber Freight','Uber Freight','approved',1,'06:00 – 09:00'],
 ['Indianapolis, IN','Dallas, TX','Reefer',2780,899,20,40000,53,'Arrive Logistics','Truckstop','approved',2,'08:00 – 12:00']
 ].map((v,i)=>({id:`LD-${2041+i}`,origin:v[0],destination:v[1],equipment:v[2],rate:v[3],miles:v[4],deadhead:v[5],weight:v[6],length:v[7],broker:v[8],source:v[9],factoring:v[10],pickup:day(v[11]),delivery:day(v[11]+2),window:v[12],age:3+i*4,contact:`loads@example.com`,commodity:v[2]==='Reefer'?'Упакованные продукты':'Паллетированный груз',notes:'Демонстрационный груз. Условия и доступность не подтверждены реальной площадкой.'}));
}
