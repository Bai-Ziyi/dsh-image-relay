# dsh-image-relay

[English](README.en.md) | 中文

DeepSeek Harness（`dsh`）的图片生成插件：给文字模型一个 `image_generate` 工具，通过任意 OpenAI 兼容中转站生成图片，并把图片作为附件放进会话。

插件不内置任何中转站地址或模型，也不会把 key 发到别处。安装后由你自己填写 Base URL、模型和 API Key。

## 安装

```sh
# Web profile
dsh plugin --profile web add github:Bai-Ziyi/dsh-image-relay

# 桌面端使用的 profile
dsh plugin --profile desktop add github:Bai-Ziyi/dsh-image-relay
```

安装后重启一次 DSH，然后打开 **插件 → 已安装 → Image Relay / 图片中转 → 配置**。

## 配置

| 字段 | 默认值 | 含义 |
|---|---|---|
| Base URL | 空 | OpenAI 兼容地址，例如 `https://your-relay.example/v1`。 |
| API Key | 空 | 中转站的 key，右侧眼睛按钮可切换显示/隐藏，默认隐藏。 |
| 模型 | 空 | 中转站要求的图片模型 id。 |
| 默认尺寸 | `1024x1024` | 模型未指定 `size` 时使用。 |
| 超时 | `180000` | 单次生成最长等待毫秒数。 |
| 另存目录 | 空 | 可选。留空只存附件库；相对路径基于当前工作区，也可以填绝对路径。 |

**API Key 会以明文保存在 profile 的 `cordis.patch.yml` 里。** 请使用只在中转站生效、可随时吊销的 key；不要填主账号的长期密钥。插件只把 key 放在发往你配置的 Base URL 的 `Authorization` 请求头里。

填了“另存目录”后，插件会在该目录再写一份可编辑的图片文件（带 `.png` / `.jpg` 等扩展名），并在工具结果里返回绝对路径。这份副本使用 Host 权限写入，请填你信任的目录；留空则仍然只保存到 DSH 附件库。

## 使用

直接对模型说：

> 画一张 1024x1024 的橘猫头像，扁平插画风，白色背景

模型会调用 `image_generate`：

- `prompt`：必填，图片描述
- `size`：可选，默认用配置
- `model`：可选，默认用配置

返回的图片会作为附件显示在会话里；如果中转站返回的是 URL，也会同时带上 URL。

## 工作原理

1. 工具向 `POST {Base URL}/images/generations` 发送 JSON：`{ model, prompt, size }`。
2. 支持中转站返回 `b64_json` 或 `url` 两种结果；URL 会被下载。
3. 图片通过 DSH 的 attachment 服务持久化，因此可以回看，也可以被支持图片输入的模型继续查看。
4. 配置了“另存目录”时，再写一份带扩展名的副本到该目录，并返回绝对路径。
5. 请求使用 Host 的全局 `fetch`，所以已经配置的 DSH 出站代理会自动生效。

## 不做什么

- 只支持 OpenAI 兼容的 `/images/generations`；不包含图生图、编辑、`n>1`、`quality` 等参数。
- 不会自动生成图片；只有模型判断需要并调用工具时才会发请求。
- 默认只保存附件；只有配置了“另存目录”才会额外写一份副本。

## 兼容性

- DSH `0.2.x`；在 `0.2.1-rc.2` 上测试过。
- 依赖 `@deepseek-ai/schemastery`（版本与 DSH `0.2.1-rc.2` 内置一致）。工具注册使用 Host 的 `ctx.tools`，不额外依赖 `dsh-tools`。
- 客户端半侧注册到 `plugins.row.config`，需要同版本 DSH 的「插件」页。

## 开发

```sh
npm test
```

测试用 mock fetch 覆盖请求构造、key 直接使用、缺少 key 的拒绝、b64 解码和图片块渲染，不访问真实中转站。

## 许可证

MIT
