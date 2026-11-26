# Remotion video

<p align="center">
  <a href="https://github.com/remotion-dev/logo">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://github.com/remotion-dev/logo/raw/main/animated-logo-banner-dark.apng">
      <img alt="Animated Remotion Logo" src="https://github.com/remotion-dev/logo/raw/main/animated-logo-banner-light.gif">
    </picture>
  </a>
</p>

Welcome to your Remotion project!

## Commands

The dashboard runs with `node server.mjs` on port 3001. Choose a duration, format, and visual style before generating. AI voice-over is optional and makes an additional Gemini TTS request when checked. The server reads `GEMINI_API_KEY` from its environment. Keep the key outside the repository.

For licensed images or B-roll, place JPG, PNG, WebP, MP4, or WebM files you are authorized to use in `public/assets/`. The generator may select only names found there. Keep license records with your asset source. New job data and narration are generated under ignored `out/` and `public/generated/`. Old videos and history remain in place.

To validate without Gemini credits, run `npm run lint`, `node --test test/server-integration.test.mjs`, and `npm run build`.

**Install Dependencies**

```console
npm i --loglevel=error
```

**Start Preview**

```console
npm run dev
```

**Render video**

```console
npx remotion render
```

**Upgrade Remotion**

```console
npx remotion upgrade
```

## Docs

Get started with Remotion by reading the [fundamentals page](https://www.remotion.dev/docs/the-fundamentals).

## Help

We provide help on our [Discord server](https://discord.gg/6VzzNDwUwV).

## Issues

Found an issue with Remotion? [File an issue here](https://github.com/remotion-dev/remotion/issues/new).

## License

Note that for some entities a company license is needed. [Read the terms here](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md).
