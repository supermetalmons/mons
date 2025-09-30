import bpy, sys, os, argparse, math, subprocess, shutil, urllib.request
from mathutils import Vector

argv = sys.argv
argv = argv[argv.index("--")+1:] if "--" in argv else []
p = argparse.ArgumentParser()
p.add_argument("--in_dir", required=True)
p.add_argument("--out_dir", required=True)
p.add_argument("--seconds", type=float, default=5.0)
p.add_argument("--fps", type=int, default=30)
p.add_argument("--size", type=int, default=1024)
p.add_argument("--exposure", type=float, default=-0.55)
p.add_argument("--world_strength", type=float, default=0.42)
p.add_argument("--light_energy", type=float, default=599.0)
p.add_argument("--environment", choices=["clean","black-room","white-room","night-sky","snowy-field","sky","meadow"], default="black-room")
args = p.parse_args(argv)

os.makedirs(args.out_dir, exist_ok=True)

bpy.ops.wm.read_homefile(use_empty=True)
scene = bpy.context.scene

eng_items = {i.identifier for i in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items}
engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in eng_items else ('BLENDER_EEVEE' if 'BLENDER_EEVEE' in eng_items else 'CYCLES')
scene.render.engine = engine

scene.render.film_transparent = (args.environment == "clean")
scene.render.resolution_x = args.size
scene.render.resolution_y = args.size
scene.render.resolution_percentage = 100
scene.frame_start = 1
scene.frame_end = int(args.seconds * args.fps)
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA" if args.environment == "clean" else "RGB"
scene.render.image_settings.color_depth = "8"
scene.render.fps = args.fps

scene.display_settings.display_device = 'sRGB'
if hasattr(scene, 'view_settings'):
    vs = scene.view_settings
    if args.environment == 'white-room':
        try:
            vs.view_transform = 'Standard'
        except Exception:
            vs.view_transform = 'Filmic'
        vs.look = 'None'
        vs.exposure = 0.0
    elif args.environment == 'night-sky':
        vs.view_transform = 'Filmic'
        vs.look = 'None'
        vs.exposure = 0.0
    else:
        vs.view_transform = 'Filmic'
        vs.look = 'None'
        vs.exposure = args.exposure

ee = getattr(scene, 'eevee', None)
if ee and engine.startswith('BLENDER_EEVEE'):
    if hasattr(ee, 'taa_render_samples'): ee.taa_render_samples = 64
    if hasattr(ee, 'use_gtao'): ee.use_gtao = (args.environment != 'white-room')
cy = getattr(scene, 'cycles', None)
if cy and engine == 'CYCLES':
    cy.samples = 64
    cy.use_adaptive_sampling = True
    cy.max_bounces = 4
    cy.use_transparent_background = (args.environment == 'clean')
    cy.device = 'CPU'

for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)

cam_data = bpy.data.cameras.new("Cam")
cam = bpy.data.objects.new("Cam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam

light_data = bpy.data.lights.new("Key", type="AREA")
light_data.energy = args.light_energy
light = bpy.data.objects.new("Key", light_data)
scene.collection.objects.link(light)

world = bpy.data.worlds.new("World")
scene.world = world
world.use_nodes = True
wn = world.node_tree.nodes
for n in list(wn): wn.remove(n)
links = world.node_tree.links
out = wn.new("ShaderNodeOutputWorld")

def ensure_hdri_local(path_or_url):
    if not path_or_url:
        # CC0 snowy HDRI from Poly Haven
        path_or_url = "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/4k/snowy_field_4k.hdr"
    if path_or_url.startswith("http://") or path_or_url.startswith("https://"):
        cache_dir = os.path.join(os.path.dirname(__file__), "scenes")
        os.makedirs(cache_dir, exist_ok=True)
        fname = os.path.basename(path_or_url.split("?")[0]) or "env.hdr"
        local_path = os.path.join(cache_dir, fname)
        if not os.path.exists(local_path):
            try:
                urllib.request.urlretrieve(path_or_url, local_path)
            except Exception as e:
                print(f"Failed to download HDRI: {e}")
                raise
        return local_path
    return path_or_url

if args.environment == "night-sky":
    base_bg = wn.new("ShaderNodeBackground")
    base_bg.inputs[0].default_value = (0.01, 0.015, 0.03, 1.0)
    base_bg.inputs[1].default_value = 0.8

    texcoord = wn.new("ShaderNodeTexCoord")
    vor = wn.new("ShaderNodeTexVoronoi")
    try:
        vor.feature = 'F1'
        vor.distance = 'EUCLIDEAN'
    except Exception:
        pass
    vor.inputs["Scale"].default_value = 80.0
    less = wn.new("ShaderNodeMath")
    less.operation = 'LESS_THAN'
    less.inputs[1].default_value = 0.05
    links.new(texcoord.outputs.get("Generated") or texcoord.outputs[0], vor.inputs["Vector"])
    dist_out = vor.outputs.get("Distance") or vor.outputs[0]
    links.new(dist_out, less.inputs[0])

    star_emm = wn.new("ShaderNodeEmission")
    star_emm.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    # Strength will be driven by mask * constant
    mul = wn.new("ShaderNodeMath")
    mul.operation = 'MULTIPLY'
    mul.inputs[1].default_value = 60.0
    links.new(less.outputs[0], mul.inputs[0])
    links.new(mul.outputs[0], star_emm.inputs["Strength"])

    add = wn.new("ShaderNodeAddShader")
    links.new(base_bg.outputs["Background"], add.inputs[0])
    links.new(star_emm.outputs["Emission"], add.inputs[1])
    links.new(add.outputs[0], out.inputs["Surface"])
else:
    if args.environment in {"snowy-field","sky","meadow"}:
        scene.render.film_transparent = False
        # Environment Texture setup
        tex = wn.new("ShaderNodeTexEnvironment")
        try:
            url_map = {
                "snowy-field": "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/4k/snowy_field_4k.hdr",
                "sky": "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/4k/citrus_orchard_puresky_4k.hdr",
                "meadow": "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/4k/meadow_2_4k.hdr",
            }
            hdri_path = ensure_hdri_local(url_map.get(args.environment))
            tex.image = bpy.data.images.load(hdri_path)
        except Exception:
            # Fallback to simple dark background if HDRI fails
            bg = wn.new("ShaderNodeBackground")
            bg.inputs[0].default_value = (0.02,0.02,0.03,1)
            bg.inputs[1].default_value = max(0.6, args.world_strength)
            links.new(bg.outputs["Background"], out.inputs["Surface"])
        else:
            texco = wn.new("ShaderNodeTexCoord")
            mapn = wn.new("ShaderNodeMapping")
            # Rotate around Z
            if hasattr(mapn.inputs[2], 'default_value'):
                rot = list(mapn.inputs[2].default_value)
                rot[2] = 0.0
                mapn.inputs[2].default_value = rot
            bg = wn.new("ShaderNodeBackground")
            bg.inputs[1].default_value = 1.0
            links.new(texco.outputs.get("Generated") or texco.outputs[0], mapn.inputs[0])
            links.new(mapn.outputs[0], tex.inputs[0])
            links.new(tex.outputs[0], bg.inputs[0])
            links.new(bg.outputs[0], out.inputs["Surface"])
    else:
        bg = wn.new("ShaderNodeBackground")
        bg.inputs[1].default_value = 1.0 if args.environment == "white-room" else args.world_strength
        bg.inputs[0].default_value = (0,0,0,1) if args.environment == "black-room" else ((1,1,1,1) if args.environment == "white-room" else (1,1,1,1))
        links.new(bg.outputs["Background"], out.inputs["Surface"])

# Build an infinite room environment when requested
if args.environment in {"black-room", "white-room"}:
    # Ensure non-transparent output when using room
    scene.render.film_transparent = False
    # Large inverted sphere to create an infinite room
    bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, radius=1.0, location=(0.0, 0.0, 0.0))
    room = bpy.context.object
    room.name = "Room"
    # Invert normals by applying a negative scale on one axis; scale up to envelop the scene
    room.scale = (100.0, -100.0, 100.0)
    # Smooth shading without relying on operators
    for poly in room.data.polygons:
        poly.use_smooth = True
    # Emissive material so the room appears uniformly colored (not just a flat layer)
    room_mat = bpy.data.materials.new("RoomMat")
    room_mat.use_nodes = True
    nodes = room_mat.node_tree.nodes
    for n in list(nodes): nodes.remove(n)
    emm = nodes.new("ShaderNodeEmission")
    emm.inputs["Color"].default_value = (0,0,0,1) if args.environment == "black-room" else (1,1,1,1)
    emm.inputs["Strength"].default_value = 1.0
    mout = nodes.new("ShaderNodeOutputMaterial")
    room_mat.node_tree.links.new(emm.outputs["Emission"], mout.inputs["Surface"])
    room.data.materials.clear()
    room.data.materials.append(room_mat)
    # Avoid the room casting shadows onto the model (Cycles)
    if hasattr(room, "cycles_visibility"):
        try:
            room.cycles_visibility.shadow = False
        except Exception:
            pass

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

def fit_camera(target, margin=1.03):
    min_c, max_c = bounds(target)
    size_vec = max_c - min_c
    center = (min_c + max_c) * 0.5
    for o in [target] + list(target.children_recursive):
        o.location -= center

    cam.data.type = "PERSP"
    cam.data.lens = 50
    fov = cam.data.angle
    diag_xz = math.sqrt(float(size_vec.x) ** 2 + float(size_vec.z) ** 2)
    radius_xz = 0.5 * diag_xz
    depth_y = float(size_vec.y)
    dist = (radius_xz * margin) / math.tan(fov / 2.0) + (depth_y * 0.25)

    cam.location = (0.0, -dist, 0.0)
    cam.rotation_euler = (math.radians(90), 0.0, 0.0)
    cam.data.clip_start = 0.01
    cam.data.clip_end = max(dist * 4.0, 1000.0)
    cam.data.shift_x = 0.0
    cam.data.shift_y = 0.0

    light.location = (dist * 0.5, -dist * 0.5, dist * 0.8)
    light.rotation_euler = (math.radians(60), 0, math.radians(30))
    if radius_xz == 0.0 and depth_y == 0.0:
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
        "-vf", f"format=rgba,scale={args.size}:{args.size}:flags=lanczos",
        "-c:v","libvpx-vp9",
        "-pix_fmt","yuva420p",
        "-colorspace","bt709","-color_primaries","bt709","-color_trc","bt709","-color_range","pc",
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
        "-vf", f"format=rgba,scale={args.size}:{args.size}:flags=lanczos",
        "-c:v","prores_ks",
        "-profile:v","4",
        "-pix_fmt","yuva444p10le",
        "-colorspace","bt709","-color_primaries","bt709","-color_trc","bt709","-color_range","pc",
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
    allowed_names = {"Cam","Key"}
    if args.environment in {"black-room","white-room"}:
        allowed_names.add("Room")
    for o in [o for o in list(bpy.data.objects) if o.name not in allowed_names]:
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
