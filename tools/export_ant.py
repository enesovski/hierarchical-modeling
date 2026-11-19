import json
import bpy


def to_app(v):
    return [round(v.x, 5), round(v.z, 5), round(-v.y, 5)]


def depth(obj):
    return 0 if obj.parent is None else 1 + depth(obj.parent)


out_dir = bpy.path.abspath("//")
parts = sorted((o for o in bpy.data.objects if o.type == "MESH"), key=lambda o: (depth(o), o.name))

bpy.ops.object.select_all(action="DESELECT")
for obj in parts:
    obj.select_set(True)
bpy.context.view_layer.objects.active = parts[0]

bpy.ops.wm.obj_export(
    filepath=out_dir + "ant.obj",
    export_selected_objects=True,
    export_uv=True, export_normals=True, export_materials=True,
    export_triangulated_mesh=True, apply_modifiers=True,
    path_mode="RELATIVE", forward_axis="NEGATIVE_Z", up_axis="Y",
)

rig = {
    "about": "Joint pivots for ant.obj in app coordinates (Y up, ant faces +Z, +X = ant's left). "
             "Vertices in ant.obj are in the same rest-pose space. Parents are listed before children.",
    "parts": [
        {"name": o.name, "parent": o.parent.name if o.parent else None,
         "pivot": to_app(o.matrix_world.translation)}
        for o in parts
    ],
}
with open(out_dir + "ant.rig.json", "w") as f:
    json.dump(rig, f, indent=2)
print(f"Exported {len(parts)} parts to {out_dir}")
