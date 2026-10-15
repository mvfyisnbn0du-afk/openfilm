# Doubao transcription

Connect **Doubao** in Studio → Settings → Providers with a Volcengine **Speech** API key,
or set `DOUBAO_ASR_API_KEY` in the environment that launches OpenFilm. Enable recorded-speech
flash recognition (`volc.bigasr.auc_turbo`) for that key. An Ark chat-model key is not a Speech key.

Choose Doubao for transcription in Settings → Models, or select it for one command:

```sh
openfilm get asr --via doubao --src assets/interview.mp4
```

OpenFilm extracts a mono 16 kHz MP3 before uploading, including from video containers. This
provider accepts recordings up to two hours and prepared audio smaller than 100 MB. It asks
for word timestamps and keeps the service's timings, converted from milliseconds to seconds;
it refuses missing, incomplete or invalid timings instead of inventing them.

Request records and returned recognition responses stay in `assets/asr/doubao-<request-id>.json`.
They contain the transcript and source filename, so treat them like the recording. Credentials
and uploaded audio are not included in request records. OpenFilm writes a word-timed VTT using
its normal transcription path and reuses it on subsequent requests unless `--force` is supplied.

An interrupted request is not retried automatically: it may already have been charged. Check
the Volcengine console before explicitly retrying. A failed request keeps any existing VTT.

The adapter uses the [recorded-speech flash recognition API](https://www.volcengine.com/docs/6561/1631584).
Its tests use a fake service on `127.0.0.1`; they do not require an account or consume credits.
