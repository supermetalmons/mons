import bpy, sys, os, argparse, math, subprocess, shutil, random
from mathutils import Vector


# Parse CLI args passed after --
argv = sys.argv
argv = argv[argv.index("--")+1:] if "--" in argv else []
p = argparse.ArgumentParser()
p.add_argument("--in_dir", required=True)
p.add_argument("--out_dir", required=True)
p.add_argument("--seconds", type=float, default=15.0)
p.add_argument("--fps", type=int, default=30)
p.add_argument("--size", type=int, default=350)
p.add_argument("--exposure", type=float, default=-0.55)
p.add_argument("--world_strength", type=float, default=0.42)
p.add_argument("--light_energy", type=float, default=599.0)
p.add_argument("--gap_multiplier", type=float, default=1.5, help="spacing multiplier based on max model depth")
args = p.parse_args(argv)

os.makedirs(args.out_dir, exist_ok=True)


# Reset to a clean scene
bpy.ops.wm.read_homefile(use_empty=True)
scene = bpy.context.scene

# Choose render engine similar to batch_render
eng_items = {i.identifier for i in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items}
engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in eng_items else ('BLENDER_EEVEE' if 'BLENDER_EEVEE' in eng_items else 'CYCLES')
scene.render.engine = engine

# Base render settings
scene.render.film_transparent = True
scene.render.resolution_x = args.size
scene.render.resolution_y = args.size
scene.render.resolution_percentage = 100
scene.frame_start = 1
scene.frame_end = int(args.seconds * args.fps)
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.image_settings.color_depth = "8"
scene.render.fps = args.fps

scene.display_settings.display_device = 'sRGB'
if hasattr(scene, 'view_settings'):
    scene.view_settings.view_transform = 'Filmic'
    scene.view_settings.look = 'None'
    scene.view_settings.exposure = args.exposure

# Engine-specific tweaks (match batch_render defaults)
ee = getattr(scene, 'eevee', None)
if ee and engine.startswith('BLENDER_EEVEE'):
    if hasattr(ee, 'taa_render_samples'):
        ee.taa_render_samples = 64
    if hasattr(ee, 'use_gtao'):
        ee.use_gtao = True
cy = getattr(scene, 'cycles', None)
if cy and engine == 'CYCLES':
    cy.samples = 64
    cy.use_adaptive_sampling = True
    cy.max_bounces = 4
    cy.use_transparent_background = True
    cy.device = 'CPU'


# Remove any pre-existing objects
for obj in list(bpy.data.objects):
    try:
        bpy.data.objects.remove(obj, do_unlink=True)
    except Exception:
        pass


# Create camera and light
cam_data = bpy.data.cameras.new("Cam")
cam = bpy.data.objects.new("Cam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam

light_data = bpy.data.lights.new("Key", type="AREA")
light_data.energy = args.light_energy
light = bpy.data.objects.new("Key", light_data)
scene.collection.objects.link(light)


# World setup (simple white background with configurable strength)
world = bpy.data.worlds.new("World")
scene.world = world
world.use_nodes = True
wn = world.node_tree.nodes
for n in list(wn):
    wn.remove(n)
bg = wn.new("ShaderNodeBackground")
bg.inputs[1].default_value = args.world_strength
bg.inputs[0].default_value = (1, 1, 1, 1)
out = wn.new("ShaderNodeOutputWorld")
world.node_tree.links.new(bg.outputs["Background"], out.inputs["Surface"])


def bounds(obj):
    local = [Vector(v[:]) for v in obj.bound_box] if obj.type != 'EMPTY' else [Vector((0, 0, 0))] * 8
    coords = [obj.matrix_world @ v for v in local]
    min_c = Vector((min(v.x for v in coords), min(v.y for v in coords), min(v.z for v in coords)))
    max_c = Vector((max(v.x for v in coords), max(v.y for v in coords), max(v.z for v in coords)))
    for c in obj.children_recursive:
        mc, xc = bounds(c)
        min_c = Vector((min(min_c.x, mc.x), min(min_c.y, mc.y), min(min_c.z, mc.z)))
        max_c = Vector((max(max_c.x, xc.x), max(max_c.y, xc.y), max(max_c.z, xc.z)))
    return min_c, max_c


def center_object_at_origin(target):
    min_c, max_c = bounds(target)
    center = (min_c + max_c) * 0.5
    for o in [target] + list(target.children_recursive):
        o.location -= center


def fit_camera_for_single(max_size_vec):
    # Compute a camera distance that nicely frames a single object of given size,
    # but place the camera slightly above and to the right, pointing at a target.
    cam.data.type = "PERSP"
    cam.data.lens = 50
    fov = cam.data.angle
    diag_xz = math.sqrt(float(max_size_vec.x) ** 2 + float(max_size_vec.z) ** 2)
    radius_xz = 0.5 * diag_xz
    depth_y = float(max_size_vec.y)
    dist = (radius_xz * 1.03) / math.tan(fov / 2.0) + (depth_y * 0.25)

    # Tracking target a bit above the lineup plane, so content sits toward top of frame
    target = bpy.data.objects.new("CamTarget", None)
    target.location = (0.0, 0.0, max(0.0, max_size_vec.z * 0.1))
    scene.collection.objects.link(target)

    # Camera positioned up-right-back, producing a diagonal screen-space motion when lineup moves along X
    cam.location = (dist * 0.85, -dist * 0.55, dist * 0.65)
    cam.rotation_euler = (0.0, 0.0, 0.0)
    cam.data.clip_start = 0.01
    cam.data.clip_end = max(dist * 4.0, 1000.0)
    cam.data.shift_x = -0.05
    cam.data.shift_y = 0.12

    # Make camera look at target
    tt = cam.constraints.new(type='TRACK_TO')
    tt.target = target
    tt.track_axis = 'TRACK_NEGATIVE_Z'
    tt.up_axis = 'UP_Y'

    # Keep a static area light above; do not parent it to anything animated
    light.location = (0.0, -dist * 0.25, dist * 1.2)
    light.rotation_euler = (math.radians(70), 0, math.radians(15))


def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    after = set(bpy.data.objects)
    imported = [o for o in (after - before) if o.type in {"MESH", "EMPTY", "ARMATURE", "LIGHT", "CAMERA"}]
    root = bpy.data.objects.new("ROOT", None)
    scene.collection.objects.link(root)
    for o in imported:
        o.parent = root
    return root


def render_png_sequence(tmp_dir):
    os.makedirs(tmp_dir, exist_ok=True)
    scene.render.filepath = os.path.join(tmp_dir, "frame_")
    bpy.ops.render.render(animation=True)


def encode_webm(tmp_dir, out_path):
    seq = os.path.join(tmp_dir, "frame_%04d.png")
    cmd = [
        "ffmpeg", "-y",
        "-framerate", str(args.fps),
        "-i", seq,
        "-vf", f"format=rgba,scale={args.size}:{args.size}:flags=lanczos",
        "-c:v", "libvpx-vp9",
        "-pix_fmt", "yuva420p",
        "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "pc",
        "-crf", "32",
        "-b:v", "0",
        "-row-mt", "1",
        "-an",
        out_path
    ]
    subprocess.check_call(cmd)


def encode_mov(tmp_dir, out_path):
    seq = os.path.join(tmp_dir, "frame_%04d.png")
    cmd = [
        "ffmpeg", "-y",
        "-framerate", str(args.fps),
        "-i", seq,
        "-vf", f"format=rgba,scale={args.size}:{args.size}:flags=lanczos",
        "-c:v", "prores_ks",
        "-profile:v", "4",
        "-pix_fmt", "yuva444p10le",
        "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "pc",
        "-an",
        out_path
    ]
    subprocess.check_call(cmd)


# Import all GLBs
glb_files = [f for f in os.listdir(args.in_dir) if f.lower().endswith(".glb")]
glb_files.sort()
# Randomize order so the lineup changes each render
random.shuffle(glb_files)

if not glb_files:
    raise SystemExit("No .glb files found in --in_dir")

objects = []
max_size_vec = Vector((0.0, 0.0, 0.0))
for fname in glb_files:
    path = os.path.join(args.in_dir, fname)
    root = import_glb(path)
    center_object_at_origin(root)
    # Rotate so models "look" along +X (direction of travel), as if following each other's back
    try:
        root.rotation_euler = (0.0, 0.0, root.rotation_euler.z + math.radians(90.0))
    except Exception:
        pass
    min_c, max_c = bounds(root)
    size_vec = max_c - min_c
    max_size_vec.x = max(max_size_vec.x, size_vec.x)
    max_size_vec.y = max(max_size_vec.y, size_vec.y)
    max_size_vec.z = max(max_size_vec.z, size_vec.z)
    objects.append(root)


# Fit camera to nicely frame a single object (front item), not the entire line length
fit_camera_for_single(max_size_vec)


# Arrange objects in a single row, first in front at X=0, others behind along -X
width_unit = max_size_vec.x if max_size_vec.x > 0 else 1.0
spacing = width_unit * args.gap_multiplier

for idx, obj in enumerate(objects):
    obj.location = Vector((-idx * spacing, 0.0, 0.0))


# Create a master lineup empty and parent all objects for a single translation animation
lineup = bpy.data.objects.new("LINEUP", None)
scene.collection.objects.link(lineup)
for obj in objects:
    obj.parent = lineup


# Animate the lineup moving left across frame over the full duration
scene.frame_set(scene.frame_start)
# Start at top-left (negative X, higher Z) with first visible and some behind
start_x = -spacing * 0.5
start_z = spacing * 0.5
lineup.location = Vector((start_x, 0.0, start_z))
lineup.keyframe_insert(data_path="location", frame=scene.frame_start)

total_length = (len(objects) - 1) * spacing
exit_margin = spacing  # ensure the last item fully exits to the right by end
final_offset = (total_length + exit_margin)

scene.frame_set(scene.frame_end)
# End bottom-right for a top-left -> bottom-right diagonal
lineup.location = Vector((final_offset, 0.0, -start_z))
lineup.keyframe_insert(data_path="location", frame=scene.frame_end)

# Make animation linear
if lineup.animation_data and lineup.animation_data.action:
    for fc in lineup.animation_data.action.fcurves:
        for kp in fc.keyframe_points:
            kp.interpolation = 'LINEAR'


# Render frames and encode outputs
tmp_dir = os.path.join(args.out_dir, "lineup_frames")
render_png_sequence(tmp_dir)

base_path = os.path.join(args.out_dir, "lineup")
encode_webm(tmp_dir, base_path + ".webm")
encode_mov(tmp_dir, base_path + ".mov")

shutil.rmtree(tmp_dir, ignore_errors=True)


