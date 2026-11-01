import numpy as np, trimesh
from manifold3d import Manifold, CrossSection
CLR=0.6; HUB_D,TIP_D=7.3,5.0
def cyl(h,r1,r2=None,n=96): return Manifold.cylinder(h,r1,r1 if r2 is None else r2,n)
def horn(arm):
    hub=CrossSection.circle((HUB_D+CLR)/2,64)
    a=CrossSection.circle((TIP_D+CLR)/2,48).translate([arm,0]); b=CrossSection.circle((TIP_D+CLR)/2,48).translate([-arm,0])
    return CrossSection.batch_hull([hub,a])+CrossSection.batch_hull([hub,b])
def spool(R, arm):
    F=R+3
    m = cyl(1.5,F)+cyl(5.0,R).translate([0,0,1.5])+cyl(2.5,R,F).translate([0,0,6.5])+cyl(1.5,F).translate([0,0,9])   # outer face at z=10.5
    m -= horn(arm).extrude(2.8).translate([0,0,-0.01])          # keyed slot for the MG90S horn arm (as v3)
    m -= cyl(6.0,(HUB_D+CLR)/2+0.1).translate([0,0,-0.01])      # hub + screw head pocket
    m -= cyl(20,2.8).translate([0,0,-1])                         # screwdriver access hole
    rt=R+0.9
    for ang in (90,270):                                         # two tie holes, 180 deg apart (one per strand)
        x,y=rt*np.cos(np.radians(ang)),rt*np.sin(np.radians(ang))
        m -= Manifold.cylinder(6,0.85,0.85,24).translate([x,y,6.0])      # 1.7 mm hole: groove -> outer face
        m -= Manifold.cylinder(1.2,1.6,1.6,32).translate([x,y,10.5-1.2]) # knot pocket on the outer face
    # entry notch in the outer flange so the line drops into the groove (at 0 deg)
    m -= Manifold.cube([F+2-(R+0.3),1.8,4.2]).translate([R+0.3,-0.9,6.4])
    me=m.to_mesh(); return trimesh.Trimesh(np.array(me.vert_properties)[:,:3],np.array(me.tri_verts))
for R,arm,tag in ((10,9.5,"r10_for_hand_mount_trim_horn"),(15,20.0,"r15_full_horn")):
    t=spool(R,arm); t.merge_vertices(); print(tag,t.is_watertight,np.round(t.extents,1)); t.export(f"spool_v4_{tag}.stl")
