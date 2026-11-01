import numpy as np, trimesh
from manifold3d import Manifold, CrossSection
def B(x0,x1,y0,y1,z0,z1): return Manifold.cube([x1-x0,y1-y0,z1-z0]).translate([x0,y0,z0])
def XC(y,z,r,x0,x1,n=48): return Manifold.cylinder(x1-x0,r,r,n).rotate([0,90,0]).translate([x0,y,z])
def YC(x,z,r,y0,y1,n=96): return Manifold.cylinder(y1-y0,r,r,n).rotate([-90,0,0]).translate([x,y0,z])
def tm(m):
    me=m.to_mesh(); t=trimesh.Trimesh(np.array(me.vert_properties)[:,:3],np.array(me.tri_verts)); t.merge_vertices(); return t
# ---- MG90S (lying on its side, shaft pointing +Y across the hand) ----
L,W,H = 22.8,12.2,22.7          # case length (x), width (z), height (y)  -- your caliper: 22.9 x 12.2
TAB_Y = 15.9                     # case bottom -> underside of mounting tabs
HOLE_SP = 27.8                   # tab screw spacing
SHAFT_X = 5.4                    # shaft offset from case centre (towards the fingers)
P = 8.0                          # servo lifted 8 mm so the spool clears the plate
Y0 = -20.0                       # case bottom
SZ = P + W/2                     # shaft height
# ---- plate (sits on back of hand; X = towards fingers, Y = across, Z = up) ----
PL_X0,PL_X1,PL_Y,T = -32,32,31,3.0
plate = CrossSection.square([PL_X1-PL_X0-12, 2*PL_Y-12]).translate([PL_X0+6,-PL_Y+6]).offset(6, 1).extrude(T).translate([0,0,-T])  # rounded corners
for sx,(xa,xb) in ((1,(8,30)),(1,(-29,-7))):
    for sy in (-1,1):
        plate -= B(xa,xb,*sorted([sy*25.3,sy*29.0]),-5,5)                   # strap slots for 20 mm velcro
mount = plate
mount += B(-17.5,17.5,Y0,Y0+H,0,P)                                         # floor the servo lies on
for s in (-1,1):
    x0,x1 = sorted([s*(L/2+0.25), s*17.5])
    mount += B(x0,x1,Y0+5,Y0+TAB_Y,0,P+W+0.2)                              # side walls; tabs screw onto their face
    mount -= Manifold.cylinder(8,0.8,0.8,24).rotate([90,0,0]).translate([s*HOLE_SP/2,Y0+TAB_Y+0.01,SZ])  # 1.6 mm pilot holes
mount -= B(-L/2-0.25,L/2+0.25,Y0-1,Y0+H+1,P,40)                            # servo pocket (open top)
# fairlead: brings the line down to skin level just before the knuckles
FY=Y0+H+1+5+0.5                                                             # centre of the spool groove (y)
fl = B(26,33,FY-4,FY+4,0,9.5)
fl -= XC(FY,5.5,1.25,20,40)
fl -= Manifold.cylinder(2.5,1.25,3.2,48).rotate([0,-90,0]).translate([26+2.5-0.01,FY,5.5])  # flared entry
fl -= Manifold.cylinder(2.5,1.25,3.2,48).rotate([0,90,0]).translate([33-2.5+0.01,FY,5.5])   # flared exit
mount += fl
# ---- small spool r10 for the MG90S horn (arm trimmed to 12 mm) ----
R,F = 10.0, 13.0; CLR=0.6; HUB_D,TIP_D,ARM = 7.3,5.0,9.5
def cyl(h,r1,r2=None,n=96): return Manifold.cylinder(h,r1,r1 if r2 is None else r2,n)
hub=CrossSection.circle((HUB_D+CLR)/2,64); tA=CrossSection.circle((TIP_D+CLR)/2,48).translate([ARM,0]); tB=CrossSection.circle((TIP_D+CLR)/2,48).translate([-ARM,0])
horn=CrossSection.batch_hull([hub,tA])+CrossSection.batch_hull([hub,tB])
sp = cyl(1.5,F)+cyl(5.0,R).translate([0,0,1.5])+cyl(2.5,R,F).translate([0,0,6.5])+cyl(1.0,F).translate([0,0,9])
sp -= horn.extrude(2.8).translate([0,0,-0.01]); sp -= cyl(6.0,(HUB_D+CLR)/2+0.1).translate([0,0,-0.01]); sp -= cyl(20,2.8).translate([0,0,-1])
sp -= Manifold.cylinder(2*R+4,1.1,1.1,24).rotate([90,0,0]).translate([R-4,R+2,4.0])
# ---- checks ----
servo = B(-L/2,L/2,Y0,Y0+H,P,P+W) + B(-16.1,16.1,Y0+TAB_Y,Y0+TAB_Y+2.5,P,P+W)          # body + tabs
spool_pos = sp.rotate([-90,0,0]).translate([SHAFT_X,Y0+H+1.0,SZ])                    # spool face 1 mm above case top
sweep = YC(SHAFT_X,SZ,F,Y0+H+1.0,Y0+H+11.0) + YC(SHAFT_X,SZ,12.3,Y0+H,Y0+H+3.5)      # spool + trimmed horn swept volume
print("servo vs mount  :", round((servo^mount).volume(),2))
print("rotating spool/horn vs mount:", round((sweep^mount).volume(),2))
print("spool bottom clearance above plate:", round(SZ-F,1),"mm   line height above plate:", round(SZ+R,1),"mm")
for n,m in (("hand_servo_mount",mount),("spool_r10_mg90s",sp)):
    t=tm(m); print(n,"watertight",t.is_watertight,"size",np.round(t.extents,1)); t.export(f"{n}.stl")
import pickle; pickle.dump({"mount":tm(mount),"servo":tm(servo),"spool":tm(spool_pos),"FY":FY,"SZ":SZ},open("hm.pkl","wb"))
