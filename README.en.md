# dsh-image-relay

[中文](README.md) | English

Image generation for DeepSeek Harness: one `image_generate` tool that turns a text prompt into an image through any OpenAI-compatible relay and attaches the result to the conversation.

The plugin ships no relay address and no model. You enter the Base URL, model and API key yourself after installing it, and the key is only sent to the Base URL you configured.

## Install

```sh
# Web profile
dsh plugin --profile web add github:Bai-Ziyi/dsh-image-relay

# Desktop profile
dsh plugin --profile desktop add github:Bai-Ziyi/dsh-image-relay
```

Restart DSH once, then open **Plugins → Installed → Image Relay → Configure**.

## Configuration

| Field | Default | Meaning |
|---|---|---|
| Base URL | empty | OpenAI-compatible endpoint, for example `https://your-relay.example/v1`. |
| API Key | empty | Relay key. The eye button toggles visibility; hidden by default. |
| Model | empty | Image model id required by the relay. |
| Default size | `1024x1024` | Used when the model does not pass `size`. |
| Timeout | `180000` | Maximum wait for one generation, in milliseconds. |
| Save a copy to | empty | Optional. Empty keeps only the attachment store; a relative path follows the current workspace, an absolute path is used as-is. |

**The API key is stored in the profile's `cordis.patch.yml` in plain text.** Use a key scoped to this relay that you can rotate or revoke; do not paste a long-lived master key. The plugin only sends it in the `Authorization` header of requests to the Base URL you configured.

When a save directory is configured, the plugin also writes an editable image file there (with a `.png` / `.jpg` extension) and returns its absolute path. That copy is written with the Host's permissions, so point it at a directory you trust; leave it empty to keep only the attachment store copy.

## Usage

Ask the model directly:

> Draw a 1024x1024 orange cat avatar, flat illustration, white background.

The model calls `image_generate`:

- `prompt` — required image description
- `size` — optional, defaults to the configured size
- `model` — optional, defaults to the configured model

The generated image is attached to the conversation; when the relay returns a URL, the URL is included too.

## How it works

1. The tool sends `POST {Base URL}/images/generations` with `{ model, prompt, size }`.
2. It accepts either `b64_json` or `url` responses; a URL is downloaded.
3. The image is persisted through DSH's attachment service, so it can be viewed again and inspected by image-capable models.
4. When a save directory is configured, a second copy with a real extension is written there and its absolute path is returned.
5. Requests use the Host's global `fetch`, so an already-configured DSH outbound proxy applies automatically.

## What it does not do

- Only OpenAI-compatible `/images/generations`; no image editing, image-to-image, `n>1`, or `quality` parameters.
- No automatic generation; a request is sent only when the model calls the tool.
- By default it stores only the attachment; a second copy is written only when a save directory is configured.

## Compatibility

- DSH `0.2.x`; tested on `0.2.1-rc.2`.
- Depends on `@deepseek-ai/schemastery` at the version bundled with DSH `0.2.1-rc.2`. Tool registration uses the Host's `ctx.tools`, so it does not need `dsh-tools` as an extra dependency.
- The client half registers into `plugins.row.config`, which requires the Plugins page from the same DSH version.

## Development

```sh
npm test
```

The test uses a mock fetch to cover request construction, direct key use, missing-key rejection, b64 decoding, and image-block rendering. It never calls a real relay.

## License

MIT
