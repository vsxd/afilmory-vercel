import { ScrollArea, Thumbhash } from "@afilmory/ui";

import { usePhotoRepository } from "~/runtime/app-runtime";

export const Component = () => {
  const photos = usePhotoRepository().getPhotos();

  return (
    <ScrollArea rootClassName="h-screen">
      <div className="columns-4 gap-0">
        {photos.map((photo) => (
          <div
            key={photo.id}
            className="group relative m-2"
            style={{
              paddingBottom: `${(photo.height / photo.width) * 100}%`,
            }}
          >
            <img
              src={photo.thumbnailUrl}
              alt={photo.title}
              height={photo.height}
              width={photo.width}
              className="absolute inset-0"
            />
            {photo.thumbHash && (
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100">
                <Thumbhash thumbHash={photo.thumbHash} />
              </div>
            )}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
};
