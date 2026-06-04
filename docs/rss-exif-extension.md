# Afilmory RSS EXIF Extension

This document describes the EXIF extension currently emitted by `apps/web/plugins/vite/rss.ts` when `buildAssetsPlugin` generates `feed.xml`.

## Protocol Metadata

Current implementation constants:

| Field            | Value                           |
| ---------------- | ------------------------------- |
| Namespace        | `https://afilmory.com/rss/exif` |
| Protocol version | `1.1`                           |
| Protocol ID      | `afilmory-rss-exif`             |
| Generator        | `Afilmory Feed Generator`       |

The RSS root element is:

```xml
<rss version="2.0" xmlns:exif="https://afilmory.com/rss/exif">
```

The channel contains:

```xml
<exif:version>1.1</exif:version>
<exif:protocol>afilmory-rss-exif</exif:protocol>
```

## Channel Fields

`generateRSSFeed(photos, config)` emits:

- `<title>` from `config.title`
- `<link>` from normalized `config.url`
- `<description>` from `config.description` or title fallback
- `<language>` from `config.locale` or `en`
- `<lastBuildDate>` as current UTC date
- `<generator>Afilmory Feed Generator</generator>`
- optional `<managingEditor>` from `config.author.name` and `config.author.url`
- EXIF protocol metadata

## Item Fields

Each manifest photo becomes an RSS item sorted newest first by `dateTaken`, then `lastModified`, with current time fallback.

The implementation emits:

- `<title>` from `photo.title` or `photo.id`
- `<link>` as `/photos/<encoded photo.id>`
- `<guid isPermaLink="false">photo.id</guid>`
- `<pubDate>` from resolved photo date
- `<description><![CDATA[...]]></description>`
- `<category>` for each tag
- optional `<enclosure>` when `photo.thumbnailUrl` exists
- optional EXIF tags when `photo.exif` exists

Enclosure behavior:

- Relative thumbnail paths are resolved against `config.url`.
- MIME type is guessed from `.webp`, `.png`, otherwise `image/jpeg`.
- `length` is currently emitted as `0`.

## Current EXIF Tags

The generated feed may include the following tags when source data is available.

### Camera Settings

| Tag                           | Source                                                          |
| ----------------------------- | --------------------------------------------------------------- |
| `<exif:aperture>`             | `exif.FNumber`, formatted as `f/{value}`                        |
| `<exif:shutterSpeed>`         | `exif.ExposureTime`, formatted as seconds or reciprocal seconds |
| `<exif:iso>`                  | `exif.ISO`                                                      |
| `<exif:exposureCompensation>` | `exif.ExposureCompensation`, formatted as `{+/-value} EV`       |

### Lens

| Tag                      | Source                                                      |
| ------------------------ | ----------------------------------------------------------- |
| `<exif:focalLength>`     | `exif.FocalLength`, normalized with `mm` suffix             |
| `<exif:focalLength35mm>` | `exif.FocalLengthIn35mmFormat`, normalized with `mm` suffix |
| `<exif:lens>`            | `exif.LensModel`, wrapped in CDATA                          |
| `<exif:maxAperture>`     | `exif.MaxApertureValue`, formatted as `f/{value}`           |

### Device and Image

| Tag                  | Source                                       |
| -------------------- | -------------------------------------------- |
| `<exif:camera>`      | `exif.Make` + `exif.Model`, wrapped in CDATA |
| `<exif:imageWidth>`  | `photo.width`                                |
| `<exif:imageHeight>` | `photo.height`                               |
| `<exif:dateTaken>`   | `photo.dateTaken`                            |
| `<exif:orientation>` | `exif.Orientation`                           |

### Technical

| Tag                      | Source                                    |
| ------------------------ | ----------------------------------------- |
| `<exif:whiteBalance>`    | `exif.WhiteBalance`                       |
| `<exif:meteringMode>`    | `exif.MeteringMode`                       |
| `<exif:flashMode>`       | `String(exif.Flash)`                      |
| `<exif:colorSpace>`      | `exif.ColorSpace`                         |
| `<exif:exposureProgram>` | `exif.ExposureProgram`                    |
| `<exif:sceneMode>`       | `exif.SceneCaptureType`, wrapped in CDATA |

### Fujifilm Recipe Mapping

When `exif.FujiRecipe` exists:

| Tag                 | Source                       |
| ------------------- | ---------------------------- |
| `<exif:sharpness>`  | `exif.FujiRecipe.Sharpness`  |
| `<exif:saturation>` | `exif.FujiRecipe.Saturation` |

The current implementation does not emit contrast from Fujifilm recipe fields.

## Location Fields

The current RSS generator intentionally does not emit:

- `<exif:gpsLatitude>`
- `<exif:gpsLongitude>`
- `<exif:altitude>`
- `<exif:location>`

GPS and reverse-geocoded location may still exist in the manifest and web UI, but they are not included in the current RSS output.

## Example

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:exif="https://afilmory.com/rss/exif">
  <channel>
    <title>My Photo Gallery</title>
    <link>https://example.com</link>
    <description>Recent photos</description>
    <language>en</language>
    <lastBuildDate>Thu, 04 Jun 2026 12:00:00 GMT</lastBuildDate>
    <generator>Afilmory Feed Generator</generator>
    <managingEditor>Alice (https://example.com)</managingEditor>
    <exif:version>1.1</exif:version>
    <exif:protocol>afilmory-rss-exif</exif:protocol>
    <item>
      <title>Sunset</title>
      <link>https://example.com/photos/sunset-001</link>
      <guid isPermaLink="false">sunset-001</guid>
      <pubDate>Wed, 03 Jun 2026 10:00:00 GMT</pubDate>
      <description><![CDATA[<p><strong>Tags:</strong> travel, sunset</p>]]></description>
      <category>travel</category>
      <category>sunset</category>
      <enclosure url="https://example.com/thumbnails/sunset-001.jpg" type="image/jpeg" length="0" />
      <exif:aperture>f/2.8</exif:aperture>
      <exif:shutterSpeed>1/250s</exif:shutterSpeed>
      <exif:iso>100</exif:iso>
      <exif:focalLength>50mm</exif:focalLength>
      <exif:lens><![CDATA[Example Lens 50mm]]></exif:lens>
      <exif:camera><![CDATA[Example Camera X100]]></exif:camera>
      <exif:imageWidth>6000</exif:imageWidth>
      <exif:imageHeight>4000</exif:imageHeight>
      <exif:dateTaken>2026-06-03T10:00:00.000Z</exif:dateTaken>
    </item>
  </channel>
</rss>
```

## Compatibility Notes

- Standard RSS readers ignore unknown namespaced EXIF elements.
- All item-level EXIF tags are optional.
- Invalid or missing values should be omitted rather than emitted as empty elements.
- Consumers should not assume location tags are present.
- Consumers should treat `guid` as an opaque photo ID, not a permalink.

## Version History

- **v1.1**: Current emitted protocol version, with channel-level protocol metadata and optional EXIF item tags.
- **v1.0**: Initial EXIF namespace convention.

## License

This document is published under Creative Commons Attribution 4.0 International License.
