---
"openfilm": patch
---

Exports on Windows: on some computers with an NVIDIA GPU, video clips came out black and an export drew one frame every five seconds, because Vulkan never showed a video's frames. OpenFilm now checks once that a video frame shows. If it doesn't, it uses the same GPU through Direct3D, or keeps Vulkan and decodes video on the CPU. If no frame of a film's videos ever shows, the export stops after a few frames and says why, instead of running for hours to make a black video.
