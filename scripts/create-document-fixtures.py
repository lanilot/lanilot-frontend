from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from pathlib import Path
out=Path(__file__).resolve().parents[1]/'output/pdf'
out.mkdir(parents=True,exist_ok=True)
for kind,title,subtitle,rows in [
 ('rc','RATE CONFIRMATION','Dispatch training document',[('Reference','DEMO LOAD'),('Route','Sample origin - Sample destination'),('Equipment','Dry Van (sample)'),('Rate','Illustrative only - no agreed rate'),('Appointments','Confirm directly with the broker')]),
 ('bol','BILL OF LADING','Pickup paperwork sample',[('Reference','DEMO LOAD'),('Shipper','Example shipper'),('Consignee','Example consignee'),('Commodity','Palletized goods (sample)'),('Quantity / weight','To be completed at pickup')]),
 ('pod','PROOF OF DELIVERY','Delivery paperwork sample',[('Reference','DEMO LOAD'),('Receiver','Example receiver'),('Delivery date','Sample - not a real delivery'),('Condition','Training example only'),('Recipient signature','Not signed - demonstration fixture')])]:
 c=canvas.Canvas(str(out/f'seed-{kind}.pdf'),pagesize=(612,792))
 c.setTitle('DEMO - '+title);c.setAuthor('Lanilot demo fixtures')
 c.setFillColor(HexColor('#2858ef'));c.rect(40,716,532,36,fill=1,stroke=0)
 c.setFillColorRGB(1,1,1);c.setFont('Helvetica-Bold',13);c.drawString(54,728,'LANILOT  /  DEMO DOCUMENT')
 c.setFillColor(HexColor('#17243b'));c.setFont('Helvetica-Bold',23);c.drawString(40,672,title)
 c.setFillColor(HexColor('#64748b'));c.setFont('Helvetica',12);c.drawString(40,647,subtitle)
 y=588
 for label,value in rows:
  c.setFillColor(HexColor('#64748b'));c.setFont('Helvetica',10);c.drawString(40,y,label.upper())
  c.setFillColor(HexColor('#1e293b'));c.setFont('Helvetica',12);c.drawString(40,y-23,value)
  c.setStrokeColor(HexColor('#e2e8f0'));c.line(40,y-39,572,y-39);y-=76
 c.setFillColor(HexColor('#fff1f2'));c.roundRect(40,107,532,65,7,fill=1,stroke=0)
 c.setFillColor(HexColor('#a83950'));c.setFont('Helvetica-Bold',11);c.drawString(54,148,'DEMONSTRATION ONLY - NOT VALID FOR TRANSPORT')
 c.setFont('Helvetica',10);c.drawString(54,129,'No real booking, signature, cargo receipt or payment obligation.')
 c.setFillColor(HexColor('#94a3b8'));c.setFont('Helvetica',9);c.drawString(40,58,'Lanilot training fixture  |  Not issued by a broker or shipper');c.drawRightString(572,58,'1 / 1')
 c.save()
