# Local music models

Music and sound effects can be made on this computer instead of by a service: `openfilm get music --via local`
(or pick Local model in Studio → Models). There is no key and nothing is billed; the person points OpenFilm at a
command that makes audio, once, in Studio (Settings → Providers → Local model) or in the environment:

```sh
OPENFILM_LOCAL_MUSIC_CMD='python C:\models\musicgen.py --prompt {prompt} --sec {sec} --outdir {outdir}'
```

The command gets the text as `{prompt}`, whole seconds as `{sec}` and an empty folder as `{outdir}`, and leaves an
audio file there (mp3, wav, ogg, flac or m4a; the largest one wins when there are several). It runs as the person,
without a shell, and is stopped with the run. Anything it prints on failure is shown, so a broken setup says why.

## MusicGen Small (Meta, 300M parameters, CPU-friendly)

The smallest setup that sounds like music. Needs Python 3.10+ and about 3 GB free (PyTorch CPU, then the model
from Hugging Face on its first run):

```sh
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
pip install audiocraft
```

Save this as `musicgen.py` (it writes one file per run into the folder it is given):

```python
import argparse, os, sys
import torch
from audiocraft.models import MusicGen
from audiocraft.data.audio import audio_write

parser = argparse.ArgumentParser()
parser.add_argument('--prompt', required=True)
parser.add_argument('--sec', type=int, required=True)
parser.add_argument('--outdir', required=True)
args = parser.parse_args()

model = MusicGen.get_pretrained('facebook/musicgen-small')
model.set_generation_params(duration=min(max(args.sec, 1), 30))
out = model.generate([args.prompt])[0].cpu()
audio_write(os.path.join(args.outdir, 'take'), out, model.sample_rate, strategy='loudness')
```

MusicGen Small makes up to 30 seconds at a time; longer asks come back as 30 seconds (play the part needed with a
media fragment). A GPU makes it several times faster; without one, a 30-second take is a few minutes on a modern
computer. The first run downloads the model (about 1 GB), so give it time.

## Other local models

Anything that can be wrapped in the same contract works: Stable Audio Open
([stable-audio-tools](https://github.com/Stability-AI/stable-audio-tools)), ACE-Step
([ACE-Step](https://github.com/ace-step/ACE-Step)), Riffusion, or a script of the person's own. Wrap it so it
takes `--prompt`, `--sec` and `--outdir` and leaves one audio file in the folder. Quality, length and speed are
the model's own; OpenFilm measures what came back and says which file it kept.
