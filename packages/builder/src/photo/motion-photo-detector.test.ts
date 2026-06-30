import { describe, expect, it } from "vitest";

import { detectMotionPhoto } from "./motion-photo-detector.js";

const VIDEO_SIZE = 10_000; // > 8 KB minimum so validateMp4Buffer accepts it
const IMAGE_SIZE = 20_000;

/** A fake MP4 tail: zero-filled with an `ftyp` brand inside the first 32 bytes. */
function makeVideoChunk(size = VIDEO_SIZE, withFtyp = true): Buffer {
  const chunk = Buffer.alloc(size, 0);
  if (withFtyp) Buffer.from("ftyp").copy(chunk, 4); // 4-byte box size, then 'ftyp'
  return chunk;
}

/** A motion-photo file is a JPEG with the MP4 appended at the end. */
function makeFile(image: Buffer, video: Buffer): Buffer {
  return Buffer.concat([image, video]);
}

const image = Buffer.alloc(IMAGE_SIZE, 0xff);

describe("detectMotionPhoto", () => {
  it("detects the video via the standard ContainerDirectory format", () => {
    const video = makeVideoChunk();
    const buffer = makeFile(image, video);
    const result = detectMotionPhoto({
      rawImageBuffer: buffer,
      exifData: {
        MotionPhoto: 1,
        MotionPhotoPresentationTimestampUs: 500_000,
        ContainerDirectory: [
          { Item: { Semantic: "Primary", Length: IMAGE_SIZE } },
          { Item: { Semantic: "MotionPhoto", Length: VIDEO_SIZE } },
        ],
      },
    });

    expect(result).toEqual({
      isMotionPhoto: true,
      motionPhotoOffset: IMAGE_SIZE, // fileLength - video.Length
      motionPhotoVideoSize: VIDEO_SIZE,
      presentationTimestampUs: 500_000,
    });
  });

  it("detects the video via the legacy MicroVideoOffset format", () => {
    const video = makeVideoChunk();
    const buffer = makeFile(image, video);
    const result = detectMotionPhoto({
      rawImageBuffer: buffer,
      exifData: {
        MicroVideo: "1",
        // offset measured from the start of the file
        MicroVideoOffset: IMAGE_SIZE,
      },
    });

    expect(result?.isMotionPhoto).toBe(true);
    expect(result?.motionPhotoOffset).toBe(IMAGE_SIZE);
    expect(result?.motionPhotoVideoSize).toBe(VIDEO_SIZE);
  });

  it("interprets a legacy offset measured from the end of the file", () => {
    const video = makeVideoChunk();
    const buffer = makeFile(image, video);
    // rawLength - VIDEO_SIZE === IMAGE_SIZE, so passing VIDEO_SIZE means "from end"
    const result = detectMotionPhoto({
      rawImageBuffer: buffer,
      exifData: { MotionPhoto: true, MicroVideoOffset: VIDEO_SIZE },
    });

    expect(result?.isMotionPhoto).toBe(true);
    expect(result?.motionPhotoOffset).toBe(IMAGE_SIZE);
  });

  it("returns null when the flag is set but no valid MP4 is present", () => {
    const video = makeVideoChunk(VIDEO_SIZE, /* withFtyp */ false);
    const buffer = makeFile(image, video);
    const result = detectMotionPhoto({
      rawImageBuffer: buffer,
      exifData: {
        MotionPhoto: true,
        ContainerDirectory: [
          { Item: { Semantic: "MotionPhoto", Length: VIDEO_SIZE } },
        ],
      },
    });
    expect(result).toBeNull();
  });

  it("returns null when there is no motion-photo flag and no container", () => {
    const buffer = makeFile(image, makeVideoChunk());
    expect(
      detectMotionPhoto({ rawImageBuffer: buffer, exifData: {} }),
    ).toBeNull();
  });

  it("rejects a video chunk smaller than the 8 KB minimum", () => {
    const smallVideo = makeVideoChunk(4096); // below MIN_VIDEO_SIZE_BYTES
    const buffer = makeFile(image, smallVideo);
    const result = detectMotionPhoto({
      rawImageBuffer: buffer,
      exifData: {
        MotionPhoto: true,
        ContainerDirectory: [
          { Item: { Semantic: "MotionPhoto", Length: smallVideo.length } },
        ],
      },
    });
    expect(result).toBeNull();
  });

  it("coerces assorted truthy flag encodings (yes/true/1/number)", () => {
    for (const flag of ["yes", "true", "1", 1]) {
      const buffer = makeFile(image, makeVideoChunk());
      const result = detectMotionPhoto({
        rawImageBuffer: buffer,
        exifData: { MotionPhoto: flag, MicroVideoOffset: IMAGE_SIZE },
      });
      expect(result?.isMotionPhoto).toBe(true);
    }
  });

  it("omits presentationTimestampUs when EXIF does not provide it", () => {
    const buffer = makeFile(image, makeVideoChunk());
    const result = detectMotionPhoto({
      rawImageBuffer: buffer,
      exifData: {
        ContainerDirectory: [
          { Item: { Semantic: "MotionPhoto", Length: VIDEO_SIZE } },
        ],
      },
    });
    expect(result?.isMotionPhoto).toBe(true);
    expect(result?.presentationTimestampUs).toBeUndefined();
  });
});
