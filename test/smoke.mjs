const defs = [];
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=';
const calls = [];
globalThis.fetch = async (url, options) => {
  calls.push({ url: String(url), authorization: options?.headers?.authorization });
  return new Response(JSON.stringify({ data: [{ b64_json: PNG }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};

const attachments = {
  async saveImages(inputs) {
    return inputs.map((input) => ({
      attachmentId: 'att_test',
      mediaType: input.mediaType,
      bytes: input.data.byteLength,
      width: 1,
      height: 1,
      name: input.name,
    }));
  },
};
const ctx = {
  tools: { register(definition) { defs.push(definition); } },
  get(service) { return service === 'attachments' ? attachments : undefined; },
};
const ref = (value) => ({ get: () => value });
const config = {
  baseURL: ref('https://relay.example/v1'),
  apiKey: ref('direct-key'),
  model: ref('test-image-model'),
  size: ref('1024x1024'),
  timeoutMs: ref(180000),
};

const module = await import('../index.js');
module.apply(ctx, config);
const tool = defs[0];
const output = await tool.execute({ prompt: 'a tiny red dot' }, { signal: new AbortController().signal });
console.log('calls', calls);
console.log('output', output);
if (calls[0]?.url !== 'https://relay.example/v1/images/generations') throw new Error('wrong endpoint');
if (calls[0]?.authorization !== 'Bearer direct-key') throw new Error('direct key missing');
if (output.image?.attachmentId !== 'att_test') throw new Error('image ref missing');
const blocks = tool.output.render({}, output);
if (!blocks.some((block) => block.type === 'image')) throw new Error('image block missing');

config.apiKey = ref('');
let failed = false;
try {
  await tool.execute({ prompt: 'a tiny red dot' }, { signal: new AbortController().signal });
} catch (error) {
  failed = /API key/u.test(String(error.message));
}
if (!failed) throw new Error('missing key was not rejected');
console.log('smoke ok');
