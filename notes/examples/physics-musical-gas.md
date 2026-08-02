# Musical gas classroom example

Run `/physics demo gas` or choose **Musical gas** in `/physics`, then press Play. The example creates four fixed walls, one curved string wall, and 250 seeded runtime circles. Particle/particle hits use a higher sine voice; particle/wall hits use a lower triangle voice. Position maps to pitch and pan, while impulse maps to amplitude.

Select a wall to edit its tags and material. While running, drag any authored dynamic body with the Selection tool to create a temporary grab spring. Use Materialize all only when individual particles must become selectable, persistent canvas objects; the runtime population is considerably cheaper.
