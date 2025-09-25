import bpy, sys, os, argparse, math, subprocess, shutil
from mathutils import Vector

argv = sys.argv
argv = argv[argv.index("--")+1:] if "--" in argv else []
p = argparse.ArgumentParser()
p.add_argument("--in_dir", required=True)
p.add_argument("--out_dir", required=True)
p.add_argument("--seconds", type=float, default=5.0)
p.add_argument("--fps", type=int, default=30)
p.add_argument("--size", type=int, default=350)
args = p.parse_args(argv)

os.makedirs(args.out_dir, exist_ok=True)

bpy.ops.wm.read_homefile(use_empty=True)
scene = bpy.context.scene

eng_items = {i.identifier for i in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items}
engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in eng_items else ('BLENDER_EEVEE' if 'BLENDER_EEVEE' in eng_items else 'CYCLES')
scene.render.engine = engine

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

ee = getattr(scene, 'eevee', None)
if ee and engine.startswith('BLENDER_EEVEE'):
    if hasattr(ee, 'taa_render_samples'): ee.taa_render_samples = 64
    if hasattr(ee, 'use_gtao'): ee.use_gtao = True
cy = getattr(scene, 'cycles', None)
if cy and engine == 'CYCLES':
    cy.samples = 64
    cy.use_adaptive_sampling = True
    cy.max_bounces = 4
    cy.use_transparent_background = True
    cy.device = 'CPU'

for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)

cam_data = bpy.data.cameras.new("Cam")
cam = bpy.data.objects.new("Cam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam

light_data = bpy.data.lights.new("Key", type="AREA")
light_data.energy = 2000
light = bpy.data.objects.new("Key", light_data)
scene.collection.objects.link(light)

world = bpy.data.worlds.new("World")
scene.world = world
world.use_nodes = True
wn = world.node_tree.nodes
for n in list(wn): wn.remove(n)
bg = wn.new("ShaderNodeBackground")
bg.inputs[1].default_value = 1.0
bg.inputs[0].default_value = (1,1,1,1)
out = wn.new("ShaderNodeOutputWorld")
world.node_tree.links.new(bg.outputs["Background"], out.inputs["Surface"])

def bounds(obj):
    local = [Vector(v[:]) for v in obj.bound_box] if obj.type != 'EMPTY' else [Vector((0,0,0))]*8
    coords = [obj.matrix_world @ v for v in local]
    min_c = Vector((min(v.x for v in coords), min(v.y for v in coords), min(v.z for v in coords)))
    max_c = Vector((max(v.x for v in coords), max(v.y for v in coords), max(v.z for v in coords)))
    for c in obj.children_recursive:
        mc, xc = bounds(c)
        min_c = Vector((min(min_c.x, mc.x), min(min_c.y, mc.y), min(min_c.z, mc.z)))
        max_c = Vector((max(max_c.x, xc.x), max(max_c.y, xc.y), max(max_c.z, xc.z)))
    return min_c, max_c

def fit_camera(target, margin=1.15):
    min_c, max_c = bounds(target)
    size_vec = max_c - min_c
    size = max(size_vec.x, size_vec.y, size_vec.z)
    center = (min_c + max_c) * 0.5
    for o in [target] + list(target.children_recursive):
        o.location -= center
    cam.data.type = "PERSP"
    cam.data.lens = 50
    fov = cam.data.angle
    dist = (size * margin) / (2 * math.tan(fov/2)) + size * 0.1
    cam.location = (0.0, -dist, 0.0)
    cam.rotation_euler = (math.radians(90), 0.0, 0.0)
    light.location = (dist*0.5, -dist*0.5, dist*0.8)
    light.rotation_euler = (math.radians(60), 0, math.radians(30))
    if size == 0:
        cam.location = (0.0, -3.0, 0.0)

def animate_rotation(obj):
    scene.frame_set(scene.frame_start)
    obj.rotation_euler = (0.0, 0.0, 0.0)
    obj.keyframe_insert(data_path="rotation_euler", frame=scene.frame_start)
    scene.frame_set(scene.frame_end + 1)
    obj.rotation_euler = (0.0, 0.0, math.radians(360))
    obj.keyframe_insert(data_path="rotation_euler", frame=scene.frame_end + 1)
    if obj.animation_data and obj.animation_data.action:
        for fc in obj.animation_data.action.fcurves:
            for kp in fc.keyframe_points:
                kp.interpolation = 'LINEAR'

def render_png_sequence(tmp_dir):
    os.makedirs(tmp_dir, exist_ok=True)
    scene.render.filepath = os.path.join(tmp_dir, "frame_")
    bpy.ops.render.render(animation=True)

def encode_webm(tmp_dir, out_path):
    seq = os.path.join(tmp_dir, "frame_%04d.png")
    cmd = [
        "ffmpeg","-y",
        "-framerate", str(args.fps),
        "-i", seq,
        "-vf", f"scale={args.size}:{args.size}:flags=lanczos",
        "-c:v","libvpx-vp9",
        "-pix_fmt","yuva420p",
        "-crf","32",
        "-b:v","0",
        "-row-mt","1",
        "-an",
        out_path
    ]
    subprocess.check_call(cmd)

def encode_mov(tmp_dir, out_path):
    seq = os.path.join(tmp_dir, "frame_%04d.png")
    cmd = [
        "ffmpeg","-y",
        "-framerate", str(args.fps),
        "-i", seq,
        "-vf", f"scale={args.size}:{args.size}:flags=lanczos",
        "-c:v","prores_ks",
        "-profile:v","4",
        "-pix_fmt","yuva444p10le",
        "-an",
        out_path
    ]
    subprocess.check_call(cmd)

def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    after = set(bpy.data.objects)
    imported = [o for o in (after - before) if o.type in {"MESH","EMPTY","ARMATURE","LIGHT","CAMERA"}]
    root = bpy.data.objects.new("ROOT", None)
    scene.collection.objects.link(root)
    for o in imported:
        o.parent = root
    return root

glbs = [f for f in os.listdir(args.in_dir) if f.lower().endswith(".glb")]
for fname in glbs:
    for o in [o for o in list(bpy.data.objects) if o.name not in {"Cam","Key"}]:
        try: bpy.data.objects.remove(o, do_unlink=True)
        except: pass
    path = os.path.join(args.in_dir, fname)
    root = import_glb(path)
    fit_camera(root)
    animate_rotation(root)
    base = os.path.splitext(fname)[0]
    tmp = os.path.join(args.out_dir, f"{base}_frames")
    render_png_sequence(tmp)
    encode_webm(tmp, os.path.join(args.out_dir, f"{base}.webm"))
    encode_mov(tmp, os.path.join(args.out_dir, f"{base}.mov"))
    shutil.rmtree(tmp, ignore_errors=True)
