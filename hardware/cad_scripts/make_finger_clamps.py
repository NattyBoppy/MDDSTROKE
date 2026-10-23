"""
Finger C-clamp generator — stroke hand exoskeleton (V1)

3 TPU C-clamps per finger (base / middle / tip segment), each wrapping ~70%
of the finger with the opening on the palm side. A raised spine on the back
of every clamp carries:
  * a press stud on top: 8 mm flat elastic with punched 3 mm holes pops over
    the studs like a watch strap (tool-free on/off, no damage)
  * two 1.4 mm channels for the braided fishing line (U-loop)
The tip clamp has a rounded nose with an open groove the line turns round.

Coordinates per clamp: Z = along the finger (Z=0 is the knuckle side),
Y = up (back of hand), X = side to side. Print each clamp standing on its
Z=0 face: no supports needed.

All sizes in millimetres. Edit FINGERS below to resize.

How to run (needs: pip install trimesh manifold3d numpy):
    python hardware/cad_scripts/make_finger_clamps.py
If you change the shape, bump VERSION so the file names change too.
"""
import json, math, os
import numpy as np
from manifold3d import Manifold, CrossSection, JoinType
import trimesh

HERE = os.path.dirname(os.path.abspath(__file__))

# ---------------------------------------------------------------- settings
WRAP = 0.70            # fraction of the finger the clamp wraps around
WALL = 1.8             # shell thickness (TPU 95A)
TAPER = 0.96           # far end of each clamp is 4% smaller (fingers taper)
H_RATIO = 0.85         # finger thickness / finger width (fingers are oval)
FOAM = 1.5             # foam liner per side -> inner size = finger + 3 mm
VERSION = "v8"         # in every file name, so old downloads can't get mixed in
# STLs go to hardware/stl/finger_clamps_<VERSION>/ (next to this scripts folder)
OUT = os.path.join(HERE, "..", "stl", f"finger_clamps_{VERSION}")
os.makedirs(OUT, exist_ok=True)
SEG = 128              # smoothness of curves

ELASTIC_W, ELASTIC_T = 8.0, 1.0           # 8 mm flat elastic, on top
ROOF_H = 4.0                              # spine height above the shell
RECESS_W, RECESS_D = 8.8, 0.6             # guide recess the elastic lies in
CABLE_D = 1.4                             # fishing-line channel (x2, U-loop)
CH_X = 3.2                                # each channel this far from centre
CAB_H = 2.0                               # channel centre above the shell
# flex sensor slot: 6.35 mm wide x ~0.5 mm sensor slides through freely
SENSOR_SLOT_W, SENSOR_SLOT_T = 7.2, 1.0
SENSOR_SLOT_Y = -0.4                      # slot floor relative to shell top
GROOVE_R = 0.6                            # U-turn groove round the tip nose
STUD_SHAFT_D, STUD_SHAFT_H = 3.0, 1.4     # stud neck (elastic sits here)
STUD_HEAD_D, STUD_TOP_D, STUD_HEAD_H = 4.6, 3.2, 1.1   # domed lead-in head
HOLE_D = 3.0                              # hole to punch in the elastic

# Caliper measurements of a team member's hand (mm), 23 Oct 2026. width = side-to-side.
# base and tip widths measured; middle segment = average of the two.
# seg = segment length joint-to-joint (still average adult values).
# Order of total length: middle > ring > index > pinky.
FINGERS = {
    "index":  {"width": [16.1, 15.2, 14.2], "seg": [42, 25, 22]},
    "middle": {"width": [15.0, 14.6, 14.2], "seg": [46, 30, 24]},
    "ring":   {"width": [14.9, 14.4, 13.8], "seg": [44, 28, 23]},
    "pinky":  {"width": [12.5, 12.0, 11.5], "seg": [34, 20, 20]},
}
SEG_NAMES = ["base", "middle", "tip"]
LEN_FRAC = [0.40, 0.45, 0.45]   # clamp length as a fraction of the segment
MIN_LEN = 9.0


def ellipse_pts(a, b, n=SEG):
    t = np.linspace(0, 2 * math.pi, n, endpoint=False)
    return np.c_[a * np.cos(t), b * np.sin(t)]


def c_section(a, b):
    """2D C-shape: oval ring with a palm-side opening, rounded tips."""
    outer = ellipse_pts(a + WALL, b + WALL)
    inner = ellipse_pts(a, b)[::-1]
    ring = CrossSection([outer.tolist(), inner.tolist()])
    # opening wedge centred on -Y (palm side)
    gap = (1 - WRAP) * 2 * math.pi
    R = (a + b) * 3
    wedge = [[0, 0]]
    for k in range(25):
        ang = -math.pi / 2 - gap / 2 + gap * k / 24
        wedge.append([R * math.cos(ang), R * math.sin(ang)])
    c = ring - CrossSection([wedge])
    # round the cut ends so they don't dig into the skin
    r = WALL * 0.45
    return c.offset(-r, JoinType.Round, circular_segments=48).offset(
        r, JoinType.Round, circular_segments=48)


def rounded_rect(w, h, r, cx=0.0, cy=0.0):
    sq = CrossSection.square([w - 2 * r, h - 2 * r], center=True)
    return sq.offset(r, JoinType.Round, circular_segments=32).translate([cx, cy])


def make_clamp(width, length, is_tip):
    a = width / 2 + FOAM
    b = width / 2 * H_RATIO + FOAM
    shell = Manifold.extrude(c_section(a, b), length, scale_top=(TAPER, TAPER))

    # ---- spine on the back
    y_top = b + WALL                       # outer top of shell at Z=0
    spine_top = y_top + ROOF_H
    spine_bot = b * 0.55                   # sink into shell, trimmed below
    spine_w = min(13.0, width)
    spine = Manifold.extrude(
        rounded_rect(spine_w, spine_top - spine_bot, 1.5, 0,
                     (spine_top + spine_bot) / 2), length)

    body = shell + spine
    # clear the finger space (tapered oval) so the spine can't poke inside
    s0 = 1.001 * (1 + (1 - TAPER) / length)          # size at z = -1
    s1 = 1.001 * (1 - (1 - TAPER) * (length + 1) / length)  # size at z = L + 1
    finger = Manifold.extrude(CrossSection([ellipse_pts(a * s0, b * s0).tolist()]),
                              length + 2, scale_top=(s1 / s0, s1 / s0)
                              ).translate([0, 0, -1])
    body = body - finger

    # soft flared lips on the inside at both ends
    lip = 1.4
    ov = 0.5   # overshoot past the end faces so the cuts are clean
    k = 1.07 + 0.07 * ov / lip
    flare = Manifold.extrude(CrossSection([ellipse_pts(a * k, b * k, SEG + 7).tolist()]),
                             lip + ov, scale_top=(1 / k, 1 / k))
    body = body - flare.translate([0, 0, -ov])
    flare_top = Manifold.extrude(CrossSection([ellipse_pts(a * TAPER * 0.995, b * TAPER * 0.995, SEG + 7).tolist()]),
                                 lip + ov, scale_top=(k / 0.995, k / 0.995))
    body = body - flare_top.translate([0, 0, length - lip])

    # shallow guide recess on top: keeps the elastic lined up
    floor_y = spine_top - RECESS_D
    recess = Manifold.extrude(
        CrossSection.square([RECESS_W, RECESS_D + 1], center=True).translate(
            [0, floor_y + (RECESS_D + 1) / 2]), length + 2).translate([0, 0, -1])
    body = body - recess

    # flex sensor slot: runs the full length, closest to the finger, so the
    # sensor follows the finger's bend and slides freely as the finger curls
    slot_y0 = y_top + SENSOR_SLOT_Y
    slot = Manifold.extrude(
        rounded_rect(SENSOR_SLOT_W, SENSOR_SLOT_T, 0.4, 0, slot_y0 + SENSOR_SLOT_T / 2),
        length + 2).translate([0, 0, -1])
    body = body - slot

    # two cable channels inside the roof (the two legs of the U-loop)
    cab_y = y_top + CAB_H
    for sx in (-1, 1):
        cable = Manifold.cylinder(length + 2, CABLE_D / 2, circular_segments=32
                                  ).translate([sx * CH_X, cab_y, -1])
        body = body - cable

    # tip clamp: rounded "nose" past the far end with an open groove round
    # its edge, so the line turns 180 degrees like a pulley (no knot needed)
    if is_tip:
        # pulley-shaped nose: a core that only reaches the inner edge of the
        # two holes, with a rim above and below them. Seen end-on, both holes
        # are full circles; the line turns round the core between the rims.
        core_r = CH_X - CABLE_D / 2              # 2.5: tangent to the holes
        rim_r = CH_X + CABLE_D / 2 + 0.2         # 4.1: covers the line's path
        gap = CABLE_D / 2 + 0.05                 # groove half-height (> hole radius)
        rim_t = 0.6
        def disc(r, y0, h):
            return Manifold.cylinder(h, r, circular_segments=72).rotate(
                [-90, 0, 0]).translate([0, y0, length])
        core = disc(core_r, cab_y - gap - 0.01, 2 * gap + 0.02)
        rim_lo = disc(rim_r, cab_y - gap - rim_t, rim_t)
        rim_hi = disc(rim_r, cab_y + gap, rim_t)
        nose = core + rim_lo + rim_hi
        # keep only the half in front of the end face (z >= length)
        front = Manifold.cube([2 * rim_r + 2, 10, rim_r + 1]).translate(
            [-rim_r - 1, cab_y - 5, length - 0.01])
        body = body + (nose ^ front)
        # re-drill both line channels so nothing sits inside them
        for sx in (-1, 1):
            redrill = Manifold.cylinder(length + 1.3, CABLE_D / 2, circular_segments=32
                                        ).translate([sx * CH_X, cab_y, -1])
            body = body - redrill

    # press stud (like a watch strap): the elastic's hole pops over the head
    sz = min(length / 2, length - STUD_HEAD_D / 2 - 1.0)
    shaft = Manifold.cylinder(STUD_SHAFT_H + 0.5, STUD_SHAFT_D / 2, circular_segments=40
                              ).rotate([-90, 0, 0]).translate([0, floor_y - 0.5, sz])
    head = Manifold.cylinder(STUD_HEAD_H, STUD_HEAD_D / 2, STUD_TOP_D / 2, circular_segments=40
                             ).rotate([-90, 0, 0]).translate([0, floor_y + STUD_SHAFT_H, sz])
    body = body + shaft + head

    body = body.simplify(0.002)
    info = dict(a=a, b=b, spine_top=spine_top, floor_y=floor_y, cab_y=cab_y, ch_x=CH_X,
                spine_w=spine_w, stud_z=sz, slot_y=slot_y0)
    return body, info


def to_trimesh(m):
    mesh = m.to_mesh()
    return trimesh.Trimesh(np.asarray(mesh.vert_properties)[:, :3],
                           np.asarray(mesh.tri_verts), process=False)


summary = {}
viewer = {}
meshes = {}
for fname, f in FINGERS.items():
    summary[fname] = []
    viewer[fname] = []
    for i, sname in enumerate(SEG_NAMES):
        seg_len = f["seg"][i]
        L = round(max(MIN_LEN, seg_len * LEN_FRAC[i]), 1)
        clamp, info = make_clamp(f["width"][i], L, i == 2)
        tm = to_trimesh(clamp)
        tag = f"{fname}_{i+1}_{sname}_{VERSION}"
        tm.export(os.path.join(OUT, f"{tag}.stl"))
        meshes[tag] = tm
        summary[fname].append(dict(
            part=tag, finger_width=f["width"][i], inner_width=round(f["width"][i] + 2 * FOAM, 1), segment_length=seg_len,
            clamp_length=L, watertight=bool(tm.is_watertight),
            volume_cm3=round(tm.volume / 1000, 2),
            bbox=[round(v, 1) for v in tm.extents], **{k: round(v, 2) for k, v in info.items()}))
        viewer[fname].append(dict(tag=tag, L=L, seg=seg_len,
                                  a=info["a"], b=info["b"],
                                  v=np.round(tm.vertices, 2).flatten().tolist(),
                                  f=tm.faces.flatten().tolist()))

# ---- one print plate with all 12 clamps standing up
plate = []
x = 0.0
for row, fname in enumerate(FINGERS):
    x = 0.0
    for i in range(3):
        tm = meshes[f"{fname}_{i+1}_{SEG_NAMES[i]}_{VERSION}"].copy()
        mn = tm.bounds[0]
        tm.apply_translation([x - mn[0], row * 36 - mn[1], -mn[2]])
        x += tm.extents[0] + 8
        plate.append(tm)
trimesh.util.concatenate(plate).export(os.path.join(OUT, f"ALL_12_print_plate_{VERSION}.stl"))

# ---- elastic cut lengths: span from base clamp start to tip clamp end + 40 mm tail
for fname, parts in summary.items():
    seg = FINGERS[fname]["seg"]
    starts = [0, seg[0], seg[0] + seg[1]]
    centres = [s + l / 2 for s, l in zip(starts, seg)]
    clamp_pos = [c - p["clamp_length"] / 2 for c, p in zip(centres, parts)]
    span = clamp_pos[2] + parts[2]["clamp_length"] - clamp_pos[0]
    gaps = [clamp_pos[1] - (clamp_pos[0] + parts[0]["clamp_length"]),
            clamp_pos[2] - (clamp_pos[1] + parts[1]["clamp_length"])]
    studs = [c + p["stud_z"] for c, p in zip(clamp_pos, parts)]
    holes = [round(studs[1] - studs[0], 1), round(studs[2] - studs[1], 1)]
    # cut = 40 mm tail before the first hole + hole-to-hole + 6 mm past the last
    summary[fname] = dict(parts=parts, clamp_start=[round(v, 1) for v in clamp_pos],
                          gaps=[round(g, 1) for g in gaps], span=round(span, 1),
                          hole_spacing=holes,
                          elastic_cut=round(40 + studs[2] - studs[0] + 6))
    for v, p in zip(viewer[fname], clamp_pos):
        v["z0"] = round(p, 2)

# sizes of every part (used by the parts table in the README)
json.dump(summary, open(os.path.join(OUT, "sizes.json"), "w"), indent=1)
# mesh data for the 3D preview pages in docs/design (only when asked: python make_finger_clamps.py --viewer)
import sys
if "--viewer" in sys.argv:
    json.dump(viewer, open(os.path.join(OUT, "viewer_meshes.json"), "w"))
print(json.dumps({k: {kk: vv for kk, vv in v.items() if kk != "parts"} for k, v in summary.items()}, indent=1))
for k, v in summary.items():
    for p in v["parts"]:
        print(p["part"], p["clamp_length"], p["bbox"], p["watertight"], p["volume_cm3"])
