window.__ModuleLoader__.load({
  id: 'dsh-image-relay',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const en = {
      title: 'Image relay',
      summary: 'Configure the OpenAI-compatible relay used by the image_generate tool.',
      baseURL: 'Relay base URL',
      baseURLHint: 'OpenAI-compatible endpoint, for example https://your-relay.example/v1.',
      apiKey: 'API key',
      apiKeyHint: 'Stored in the profile config in plain text. Use a key scoped to this relay.',
      showKey: 'Show key',
      hideKey: 'Hide key',
      model: 'Image model',
      modelHint: 'Model id the relay expects, for example gpt-image-2.',
      size: 'Default size',
      sizeHint: 'Used when the model does not pass a size argument.',
      timeoutMs: 'Timeout (ms)',
      timeoutHint: 'Maximum wait for one generation. Image models often need 30-120 seconds.',
      save: 'Save',
      saving: 'Saving…',
      saved: 'Saved.',
      discard: 'Discard',
      readOnly: 'This profile is read-only.',
      unavailable: 'The image relay settings are not available right now.',
      saveFailed: 'The profile did not accept the change. Correct it and try again.',
      invalidURL: 'Enter an http:// or https:// base URL.',
      invalidTimeout: 'Enter a positive number of milliseconds.',
    };

    const zh = {
      title: '图片中转',
      summary: '配置 image_generate 工具使用的 OpenAI 兼容中转站。',
      baseURL: '中转站 Base URL',
      baseURLHint: 'OpenAI 兼容地址，例如 https://your-relay.example/v1。',
      apiKey: 'API Key',
      apiKeyHint: '会以明文保存在 profile 配置里；请使用仅限该中转站的 key。',
      showKey: '显示密钥',
      hideKey: '隐藏密钥',
      model: '生图模型',
      modelHint: '中转站要求的模型 id，例如 gpt-image-2。',
      size: '默认尺寸',
      sizeHint: '模型调用时未指定 size 就用这个值。',
      timeoutMs: '超时（毫秒）',
      timeoutHint: '单次生成最长等待时间。生图通常需要 30-120 秒。',
      save: '保存',
      saving: '保存中…',
      saved: '已保存。',
      discard: '放弃修改',
      readOnly: '当前 profile 为只读。',
      unavailable: '暂时无法读取图片中转设置。',
      saveFailed: 'profile 没有接受这次修改，请修正后重试。',
      invalidURL: '请填写 http:// 或 https:// 开头的 Base URL。',
      invalidTimeout: '请填写正整数的毫秒数。',
    };

    const color = {
      primary: 'var(--dsw-alias-label-primary, currentColor)',
      secondary: 'var(--dsw-alias-label-secondary, #777)',
      tertiary: 'var(--dsw-alias-label-tertiary, #999)',
      error: 'var(--dsw-alias-state-error-primary, #d33)',
      accent: 'var(--dsw-alias-state-business-primary, #247bbf)',
      border: 'var(--dsw-alias-border-l1, color-mix(in srgb, currentColor 22%, transparent))',
      field: 'var(--dsw-alias-bg-layer-2, color-mix(in srgb, currentColor 4%, transparent))',
    };

    const SIZES = ['1024x1024', '1536x1024', '1024x1536', 'auto'];

    function Field({ label, hint, children }) {
      return h('label', { style: { display: 'grid', gap: 6 } },
        h('span', { style: { fontSize: 13, fontWeight: 500, color: color.primary } }, label),
        children,
        hint === undefined ? null : h('span', { style: { fontSize: 12, color: color.secondary, lineHeight: '18px' } }, hint),
      );
    }

    function inputStyle(disabled) {
      return {
        boxSizing: 'border-box',
        width: '100%',
        height: 32,
        padding: '0 10px',
        borderRadius: 8,
        border: `1px solid ${color.border}`,
        background: color.field,
        color: color.primary,
        font: 'inherit',
        fontSize: 13,
        opacity: disabled ? 0.6 : 1,
      };
    }

    function EyeIcon({ off }) {
      return h('svg', {
        viewBox: '0 0 24 24',
        width: 16,
        height: 16,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.8,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
      },
        h('path', { d: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z' }),
        h('circle', { cx: 12, cy: 12, r: 3 }),
        off ? h('path', { d: 'M3 3l18 18' }) : null,
      );
    }

    function ImageRelayPage(props) {
      const t = typeof props.t === 'function' ? props.t : (key) => key;
      if (props.view === 'summary') return t('summary');

      const form = props.form;
      if (form === undefined || form === null || form.state === undefined) {
        return h('p', { style: { margin: 0, fontSize: 13, color: color.secondary } }, t('unavailable'));
      }

      const snapshot = form.state;
      const value = snapshot.value ?? {};
      const base = {
        baseURL: value.baseURL ?? '',
        apiKey: value.apiKey ?? '',
        model: value.model ?? '',
        size: value.size ?? '1024x1024',
        timeoutMs: Number(value.timeoutMs ?? 180000),
      };
      const writable = snapshot.writable !== false;

      const [draft, setDraft] = React.useState(base);
      const [showKey, setShowKey] = React.useState(false);
      const [saving, setSaving] = React.useState(false);
      const [error, setError] = React.useState(null);
      const [saved, setSaved] = React.useState(false);

      React.useEffect(() => {
        setDraft(base);
        setSaved(false);
      }, [snapshot.revision]);

      const dirty = draft.baseURL !== base.baseURL
        || draft.apiKey !== base.apiKey
        || draft.model !== base.model
        || draft.size !== base.size
        || draft.timeoutMs !== base.timeoutMs;

      const edit = (key, next) => {
        setDraft((previous) => ({ ...previous, [key]: next }));
        setSaved(false);
      };

      const save = async () => {
        if (!/^https?:\/\//iu.test(draft.baseURL.trim())) {
          setError(t('invalidURL'));
          return;
        }
        if (!Number.isFinite(draft.timeoutMs) || draft.timeoutMs <= 0) {
          setError(t('invalidTimeout'));
          return;
        }
        setSaving(true);
        setError(null);
        setSaved(false);
        let accepted = false;
        let failure = null;
        try {
          accepted = await form.mutate([
            { op: 'set', path: ['baseURL'], value: draft.baseURL.trim() },
            { op: 'set', path: ['apiKey'], value: draft.apiKey.trim() },
            { op: 'set', path: ['model'], value: draft.model.trim() },
            { op: 'set', path: ['size'], value: draft.size },
            { op: 'set', path: ['timeoutMs'], value: Math.round(draft.timeoutMs) },
          ], snapshot.revision);
        } catch (cause) {
          failure = cause instanceof Error ? cause.message : String(cause);
        }
        setSaving(false);
        if (accepted) setSaved(true);
        else setError(failure ?? t('saveFailed'));
      };

      const disabled = !writable || saving;

      return h('div', { style: { display: 'grid', gap: 16, padding: '4px 0 8px' } },
        h(Field, { label: t('baseURL'), hint: t('baseURLHint') },
          h('input', {
            type: 'url',
            value: draft.baseURL,
            disabled,
            spellCheck: false,
            placeholder: 'https://your-relay.example/v1',
            onChange: (event) => edit('baseURL', event.target.value),
            style: inputStyle(disabled),
          }),
        ),
        h(Field, { label: t('apiKey'), hint: t('apiKeyHint') },
          h('div', { style: { position: 'relative', display: 'flex' } },
            h('input', {
              type: showKey ? 'text' : 'password',
              value: draft.apiKey,
              disabled,
              spellCheck: false,
              autoComplete: 'off',
              placeholder: 'API key',
              onChange: (event) => edit('apiKey', event.target.value),
              style: { ...inputStyle(disabled), paddingRight: 38 },
            }),
            h('button', {
              type: 'button',
              disabled,
              'aria-label': showKey ? t('hideKey') : t('showKey'),
              title: showKey ? t('hideKey') : t('showKey'),
              onClick: () => setShowKey((previous) => !previous),
              style: {
                position: 'absolute',
                top: 0,
                right: 0,
                width: 34,
                height: 32,
                display: 'grid',
                placeItems: 'center',
                border: 'none',
                background: 'transparent',
                color: color.secondary,
                cursor: disabled ? 'default' : 'pointer',
                opacity: disabled ? 0.5 : 1,
              },
            }, h(EyeIcon, { off: showKey })),
          ),
        ),
        h(Field, { label: t('model'), hint: t('modelHint') },
          h('input', {
            type: 'text',
            value: draft.model,
            disabled,
            spellCheck: false,
            placeholder: 'image-model-id',
            onChange: (event) => edit('model', event.target.value),
            style: inputStyle(disabled),
          }),
        ),
        h(Field, { label: t('size'), hint: t('sizeHint') },
          h('select', {
            value: draft.size,
            disabled,
            onChange: (event) => edit('size', event.target.value),
            style: { ...inputStyle(disabled), padding: '0 8px' },
          }, SIZES.map((size) => h('option', { key: size, value: size }, size))),
        ),
        h(Field, { label: t('timeoutMs'), hint: t('timeoutHint') },
          h('input', {
            type: 'number',
            min: 1000,
            step: 1000,
            value: draft.timeoutMs,
            disabled,
            onChange: (event) => edit('timeoutMs', Number(event.target.value)),
            style: inputStyle(disabled),
          }),
        ),

        error === null ? null : h('p', { role: 'alert', style: { margin: 0, fontSize: 12, color: color.error } }, error),
        saved ? h('p', { role: 'status', style: { margin: 0, fontSize: 12, color: color.secondary } }, t('saved')) : null,
        !writable ? h('p', { style: { margin: 0, fontSize: 12, color: color.secondary } }, t('readOnly')) : null,

        h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
          h('button', {
            type: 'button',
            disabled: !writable || saving || !dirty,
            onClick: save,
            style: {
              height: 30,
              padding: '0 14px',
              border: 'none',
              borderRadius: 8,
              background: color.accent,
              color: '#fff',
              font: 'inherit',
              fontSize: 13,
              cursor: !writable || saving || !dirty ? 'default' : 'pointer',
              opacity: !writable || saving || !dirty ? 0.5 : 1,
            },
          }, saving ? t('saving') : t('save')),
          dirty ? h('button', {
            type: 'button',
            disabled: saving,
            onClick: () => {
              setDraft(base);
              setError(null);
              setSaved(false);
            },
            style: {
              height: 30,
              padding: '0 12px',
              border: `1px solid ${color.border}`,
              borderRadius: 8,
              background: 'transparent',
              color: color.primary,
              font: 'inherit',
              fontSize: 13,
              cursor: saving ? 'default' : 'pointer',
            },
          }, t('discard')) : null,
          h('span', { style: { fontSize: 12, color: color.tertiary } },
            `${t('model')}: ${base.model} · ${base.size}`),
        ),
      );
    }

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register('imageRelay', { en, zh }), 'image-relay: locale');
      ctx.effect(() => ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
        name: 'plugins.row.config',
        key: 'dsh-image-relay#image-relay',
        locale: 'imageRelay',
      }, ImageRelayPage)), 'image-relay: page');
    }

    return { inject: ['slots', 'locale'], apply };
  },
});
