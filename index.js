import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomBytes } from 'node:crypto';
import z from '@deepseek-ai/schemastery';

/** Cordis plugin name; also the row id's owner in the profile patch. */
export const name = 'image-relay';

/** The tool registry must exist before this plugin can register its tool. */
export const inject = ['tools'];

/**
 * Relay connection and defaults. Every field is volatile so the Plugins page
 * can edit it through the settings form.
 */
export const Config = z.object({
  baseURL: z.string().default('').volatile(),
  apiKey: z.string().default('').volatile(),
  model: z.string().default('').volatile(),
  size: z.string().default('1024x1024').volatile(),
  timeoutMs: z.number().default(180000).volatile(),
  outputDir: z.string().default('').volatile(),
});

/** Build an absolute endpoint from an OpenAI-compatible base URL. */
function endpoint(baseURL, path) {
  return new URL(path, baseURL.endsWith('/') ? baseURL : `${baseURL}/`).toString();
}

/** Identify a supported image by its leading bytes. */
function sniffMediaType(bytes) {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (bytes.length >= 6 && /^GIF8[79]a$/u.test(bytes.toString('ascii', 0, 6))) return 'image/gif';
  return undefined;
}

/** Pick a file extension for the attachment name. */
function extensionFor(mediaType) {
  return mediaType === 'image/jpeg' ? 'jpg' : mediaType === 'image/webp' ? 'webp' : mediaType === 'image/gif' ? 'gif' : 'png';
}

/** Combine the caller's abort signal with the configured image-generation timeout. */
function requestSignal(caller, timeoutMs) {
  const signals = [];
  if (caller !== undefined) signals.push(caller);
  if (Number.isFinite(timeoutMs) && timeoutMs > 0) signals.push(AbortSignal.timeout(timeoutMs));
  if (signals.length === 0) return undefined;
  if (signals.length === 1) return signals[0];
  return typeof AbortSignal.any === 'function' ? AbortSignal.any(signals) : signals[0];
}

/** Expand the current user's `~` forms without touching other users' paths. */
function expandHome(value) {
  if (value === '~') return os.homedir();
  if (value.startsWith('~/') || value.startsWith('~\\')) return path.join(os.homedir(), value.slice(2));
  return value;
}

/** The current session workspace, falling back to the Host's working directory. */
async function sessionCwd(ctx, exec) {
  const workingDirectory = ctx.get('workingDirectory');
  if (workingDirectory !== undefined && typeof workingDirectory.ensure === 'function' && exec.agent !== undefined) {
    try {
      const cwd = await workingDirectory.ensure(exec.agent, exec.signal);
      if (typeof cwd === 'string' && cwd !== '') return cwd;
    } catch {
      // Fall through to the Host directory when the session has no workspace.
    }
  }
  return process.cwd();
}

/** Resolve the optional copy destination; relative paths follow the session workspace. */
async function resolveOutputDir(ctx, exec, raw) {
  const expanded = expandHome(raw);
  if (path.isAbsolute(expanded)) return path.resolve(expanded);
  return path.resolve(await sessionCwd(ctx, exec), expanded);
}

/** Append a diagnostic without replacing an earlier one. */
function appendNote(note, message) {
  return note === undefined ? message : `${note} ${message}`;
}

/**
 * Register the model-facing image generator. The tool uses the Host's global
 * fetch, so the configured outbound proxy applies automatically. Images are
 * persisted through the attachment service, which lets the UI render them and
 * lets image-capable models inspect them.
 */
export function apply(ctx, config) {
  ctx.tools.register({
    name: 'image_generate',
    description: 'Generate an image from a text prompt through the configured OpenAI-compatible relay. Returns the image inline when attachment storage is available, plus the provider URL when one is returned.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['prompt'],
      properties: {
        prompt: {
          type: 'string',
          description: 'Text prompt describing the image to generate.',
        },
        size: {
          type: 'string',
          description: 'Optional output size, for example 1024x1024, 1536x1024, or 1024x1536. Defaults to the configured size.',
        },
        model: {
          type: 'string',
          description: 'Optional image model id. Defaults to the configured model.',
        },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['model', 'size'],
        properties: {
          model: { type: 'string' },
          size: { type: 'string' },
          url: { type: 'string' },
          revisedPrompt: { type: 'string' },
          note: { type: 'string' },
          savedPath: { type: 'string' },
          image: {
            type: 'object',
            additionalProperties: false,
            required: ['attachmentId', 'mediaType', 'bytes', 'width', 'height'],
            properties: {
              attachmentId: { type: 'string' },
              mediaType: { type: 'string' },
              bytes: { type: 'integer' },
              width: { type: 'integer' },
              height: { type: 'integer' },
              name: { type: 'string' },
            },
          },
        },
      },
      render: (_args, value) => {
        const lines = [`Generated ${value.model} image at ${value.size}.`];
        if (value.url !== undefined) lines.push(`URL: ${value.url}`);
        if (value.savedPath !== undefined) lines.push(`Saved copy: ${value.savedPath}`);
        if (value.note !== undefined) lines.push(value.note);
        if (value.image !== undefined) {
          lines.push(`Attached: ${value.image.mediaType}, ${value.image.width}x${value.image.height} px, ${value.image.bytes} bytes.`);
        }
        const blocks = [{ type: 'text', text: lines.join('\n') }];
        if (value.image !== undefined) blocks.push({ type: 'image', attachment: value.image });
        return blocks;
      },
    },
    async execute(args, exec) {
      const prompt = typeof args.prompt === 'string' ? args.prompt.trim() : '';
      if (prompt === '') throw new Error('prompt must be a non-empty string');

      const baseURL = String(config.baseURL.get() ?? '').trim();
      if (baseURL === '') throw new Error('set the relay base URL in the image-relay settings');
      const model = String(args.model ?? config.model.get() ?? '').trim();
      if (model === '') throw new Error('set an image model in the image-relay settings');
      const size = String(args.size ?? config.size.get() ?? '').trim() || '1024x1024';
      const apiKey = String(config.apiKey.get() ?? '').trim();
      if (apiKey === '') throw new Error('set the API key in the image-relay settings');
      const timeoutMs = Number(config.timeoutMs.get() ?? 0);
      const signal = requestSignal(exec.signal, timeoutMs);

      const response = await fetch(endpoint(baseURL, 'images/generations'), {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ model, prompt, size }),
        ...(signal === undefined ? {} : { signal }),
      });
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 500).trim();
        throw new Error(`image relay returned HTTP ${response.status}${detail === '' ? '' : `: ${detail}`}`);
      }

      const payload = await response.json();
      const item = Array.isArray(payload?.data) ? payload.data[0] : undefined;
      if (item === undefined) throw new Error('image relay response has no data[0]');

      let bytes;
      let mediaType;
      let remoteURL;
      if (typeof item.b64_json === 'string' && item.b64_json.length > 0) {
        bytes = Buffer.from(item.b64_json, 'base64');
        mediaType = sniffMediaType(bytes) ?? 'image/png';
      } else if (typeof item.url === 'string' && item.url.length > 0) {
        remoteURL = item.url;
        const imageResponse = await fetch(remoteURL, { ...(signal === undefined ? {} : { signal }) });
        if (!imageResponse.ok) throw new Error(`could not download generated image: HTTP ${imageResponse.status}`);
        bytes = Buffer.from(await imageResponse.arrayBuffer());
        const declared = imageResponse.headers.get('content-type')?.split(';')[0]?.trim();
        mediaType = declared !== undefined && declared.startsWith('image/') ? declared : sniffMediaType(bytes) ?? 'image/png';
      } else {
        throw new Error('image relay response has neither b64_json nor url');
      }
      if (bytes.length === 0) throw new Error('image relay returned an empty image');
      if (bytes.length > 30 * 1024 * 1024) throw new Error(`generated image is too large (${bytes.length} bytes)`);

      const attachments = ctx.get('attachments');
      let image;
      let note;
      if (attachments !== undefined) {
        try {
          const [ref] = await attachments.saveImages([{
            data: new Uint8Array(bytes),
            mediaType,
            name: `generated-${Date.now()}.${extensionFor(mediaType)}`,
          }]);
          image = {
            attachmentId: ref.attachmentId,
            mediaType: ref.mediaType,
            bytes: ref.bytes,
            width: ref.width,
            height: ref.height,
            ...(ref.name === undefined ? {} : { name: ref.name }),
          };
        } catch (error) {
          note = `The image was generated but could not be attached: ${error instanceof Error ? error.message : String(error)}`;
        }
      } else {
        note = 'No attachment store is mounted; the image is available through the URL below.';
      }

      let savedPath;
      const outputDir = String(config.outputDir.get() ?? '').trim();
      if (outputDir !== '') {
        try {
          const directory = await resolveOutputDir(ctx, exec, outputDir);
          await fs.mkdir(directory, { recursive: true });
          const target = path.join(directory, `generated-${Date.now()}-${randomBytes(3).toString('hex')}.${extensionFor(mediaType)}`);
          await fs.writeFile(target, bytes);
          savedPath = target;
        } catch (error) {
          note = appendNote(note, `The image was generated but could not be saved to "${outputDir}": ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      if (image === undefined && remoteURL === undefined && savedPath === undefined) throw new Error(note ?? 'image was generated but could not be stored');

      return {
        model,
        size,
        ...(remoteURL === undefined ? {} : { url: remoteURL }),
        ...(typeof item.revised_prompt === 'string' ? { revisedPrompt: item.revised_prompt } : {}),
        ...(image === undefined ? {} : { image }),
        ...(savedPath === undefined ? {} : { savedPath }),
        ...(note === undefined ? {} : { note }),
      };
    },
  });
}
